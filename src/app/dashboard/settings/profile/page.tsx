import type { Metadata } from 'next'
import { eq } from 'drizzle-orm'

import { ProfileForm } from '@/components/profile-form'
import { db } from '@/server/db'
import { instructorProfiles } from '@/server/db/schema'
import { requireWorkspaceContext } from '@/server/workspace/context'

export const metadata: Metadata = { title: '公開資料' }

export default async function ProfileSettingsPage() {
  // 每個讀取資料的頁面都自行授權，不倚賴 layout 的檢查
  const ctx = await requireWorkspaceContext()

  const [profile] = await db
    .select({
      bio: instructorProfiles.bio,
      contactEmail: instructorProfiles.contactEmail,
      contactPhone: instructorProfiles.contactPhone,
    })
    .from(instructorProfiles)
    .where(eq(instructorProfiles.id, ctx.instructorProfileId))
    .limit(1)

  const publicUrlBase = process.env.NEXT_PUBLIC_APP_URL ?? ''

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">公開資料</h1>
        <p className="mt-1 text-sm text-ink-muted">這些資料會顯示在學生看到的公開頁。</p>
      </div>

      <ProfileForm
        publicUrlBase={publicUrlBase}
        initial={{
          displayName: ctx.displayName,
          slug: ctx.workspaceSlug,
          timezone: ctx.timezone,
          bio: profile?.bio ?? '',
          contactEmail: profile?.contactEmail ?? '',
          contactPhone: profile?.contactPhone ?? '',
        }}
      />
    </div>
  )
}
