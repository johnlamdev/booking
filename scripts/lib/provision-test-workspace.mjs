import postgres from 'postgres'

const DEMO_NAMES = ['John', '陳同學', '李同學', '王同學', 'Amy', 'Chris', '黃同學', '林同學', '張同學', '何同學', 'Kelly', 'Sam']
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function randomSlug() {
  let suffix = ''
  for (let index = 0; index < 6; index++) {
    suffix += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)]
  }
  return `t-${suffix}`
}

function defaultDisplayName(email) {
  return email.split('@')[0]?.trim() || '老師'
}

function requiresSsl(connectionString) {
  try {
    const { hostname } = new URL(connectionString)
    return !['localhost', '127.0.0.1', '::1', 'postgres-test'].includes(hostname)
  } catch {
    return true
  }
}

async function availableSlug(tx) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const slug = randomSlug()
    const rows = await tx`select id from workspaces where slug = ${slug} limit 1`
    if (rows.length === 0) return slug
  }
  throw new Error('無法產生未被使用的 workspace slug')
}

/**
 * 在老師登入前建立不依賴日期的固定資料。查詢、課堂及休假情境仍由首次登入建立，
 * 確保相對日期不會因邀請發出得早而過期。
 */
export async function provisionTestWorkspace({ databaseUrl, authUserId, email }) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required to provision the test workspace')

  const client = postgres(databaseUrl, {
    prepare: false,
    ssl: requiresSsl(databaseUrl) ? 'require' : false,
    max: 1,
  })

  try {
    return await client.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${authUserId}, 0))`

      const existing = await tx`
        select
          u.id as user_id,
          wm.workspace_id,
          ip.id as instructor_id
        from users u
        join workspace_members wm on wm.user_id = u.id
        join instructor_profiles ip on ip.workspace_id = wm.workspace_id and ip.is_active = true
        where u.auth_user_id = ${authUserId}
          and wm.role = 'OWNER'
          and wm.status = 'ACTIVE'
        limit 1
      `

      let context = existing[0]
      let createdWorkspace = false

      if (!context) {
        const displayName = defaultDisplayName(email)
        const slug = await availableSlug(tx)
        const [user] = await tx`
          insert into users (auth_user_id, email)
          values (${authUserId}, ${email})
          on conflict (auth_user_id) do update set email = excluded.email, updated_at = now()
          returning id
        `
        const [workspace] = await tx`
          insert into workspaces (
            name, slug, timezone, type, is_public, is_experience,
            experience_version, experience_started_at
          ) values (
            ${displayName}, ${slug}, 'Asia/Hong_Kong', 'PERSONAL', true, true,
            'tester-v1', null
          )
          returning id
        `
        await tx`
          insert into workspace_members (workspace_id, user_id, role, status)
          values (${workspace.id}, ${user.id}, 'OWNER', 'ACTIVE')
        `
        const [instructor] = await tx`
          insert into instructor_profiles (workspace_id, user_id, display_name, is_active)
          values (${workspace.id}, ${user.id}, ${displayName}, true)
          returning id
        `
        await tx`
          insert into services (
            workspace_id, instructor_id, name, service_type,
            duration_minutes, status, sort_order
          ) values (
            ${workspace.id}, ${instructor.id}, '60 分鐘私人課', 'PRIVATE',
            60, 'ACTIVE', 0
          )
        `
        await tx`
          insert into availability_rules (workspace_id, instructor_id, weekday, start_time, end_time)
          select ${workspace.id}, ${instructor.id}, weekday, time '09:00', time '21:00'
          from generate_series(0, 6) as weekday
        `

        context = {
          user_id: user.id,
          workspace_id: workspace.id,
          instructor_id: instructor.id,
        }
        createdWorkspace = true
      }

      const demoStudents = DEMO_NAMES.map((name, index) => {
        const suffix = String(index + 1).padStart(4, '0')
        return {
          workspace_id: context.workspace_id,
          display_name: `【測試】${name}`,
          phone: `+852 0000 ${suffix}`,
          normalized_phone: `8520000${suffix}`,
        }
      })

      await tx`
        insert into students ${tx(demoStudents, 'workspace_id', 'display_name', 'phone', 'normalized_phone')}
        on conflict do nothing
      `

      return {
        createdWorkspace,
        workspaceId: context.workspace_id,
        instructorId: context.instructor_id,
        fixedStudentCount: demoStudents.length,
      }
    })
  } finally {
    await client.end({ timeout: 5 })
  }
}
