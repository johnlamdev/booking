import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** 需要登入才可進入的路徑前綴。 */
const PROTECTED_PREFIXES = ['/dashboard']

/** 已登入者不應停留的路徑。 */
const AUTH_ONLY_PATHS = ['/login', '/signup', '/forgot-password']

/**
 * Proxy（Next.js 16 起 middleware 改名）。
 *
 * 職責有二：
 * 1. 刷新 Supabase session cookie，讓老師長期保持登入。
 * 2. 做**樂觀**的路由導向。
 *
 * 這裡不是授權防線——它只讀 cookie、不查資料庫（Proxy 會在每個 route
 * 甚至 prefetch 上執行）。真正的授權在 requireWorkspaceContext()，
 * 緊貼資料存取。見 docs/DESIGN.md §5。
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const path = request.nextUrl.pathname
  const isAuthOnlyPath = AUTH_ONLY_PATHS.includes(path)

  // /preparing 只顯示不含私人資料的進度外殼；讓它先回應，然後由其
  // Server Action 執行真正身份驗證及 workspace 初始化。這樣登入成功後
  // 不會再等一次 Proxy Auth 才看到回饋。
  if (path === '/preparing') return response

  // Server Actions 會以 POST 送回目前頁面。註冊／重設密碼的 Action 已各自
  // 完成所需驗證，不需要在 Proxy 先查一次 Auth。GET 仍保留檢查，讓已登入者
  // 不會返回登入頁；登入表單本身則由 Browser Client 直接連 Supabase。
  if (request.method === 'POST' && isAuthOnlyPath) return response

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // 缺少設定時不阻擋公開頁；後台的 DAL 仍會攔下未登入者
  if (!url || !anonKey) return response

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const authStartedAt = performance.now()
  // getClaims() 會驗證 JWT 簽名；使用非對稱 signing key 時可在本地完成，
  // 避免 getUser() 每個 request 都往返 Auth server。需要刷新 token 時，
  // @supabase/ssr 仍會透過上面的 setAll 寫回新 cookie。
  const { data: claimsData } = await supabase.auth.getClaims()
  const isAuthenticated = Boolean(claimsData?.claims?.sub)
  const authElapsedMs = Math.round(performance.now() - authStartedAt)

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  )

  if (authElapsedMs >= 500) {
    console.info(
      `[perf] proxy auth path=${path} method=${request.method} claims_ms=${authElapsedMs}`,
    )
  }

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL('/login', request.nextUrl)
    // 登入後導回原本要去的頁面。只保留 path，避免把 query string 一併帶走。
    loginUrl.searchParams.set('next', path)
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthenticated && isAuthOnlyPath) {
    return NextResponse.redirect(new URL('/dashboard', request.nextUrl))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * 略過靜態資源與圖片最佳化請求。
     * 其餘一律經過，讓 session 在公開頁瀏覽期間也能保持新鮮。
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
