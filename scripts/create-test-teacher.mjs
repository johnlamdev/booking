import { createClient } from '@supabase/supabase-js'

import { provisionTestWorkspace } from './lib/provision-test-workspace.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.TEST_TEACHER_EMAIL?.trim().toLowerCase()
const password = process.env.TEST_TEACHER_PASSWORD
const databaseUrl = process.env.DATABASE_URL

if (!url || !serviceRoleKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
if (!email) throw new Error('TEST_TEACHER_EMAIL is required')
if (!password || password.length < 8) throw new Error('TEST_TEACHER_PASSWORD must contain at least 8 characters')
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findExistingUser() {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const existing = data.users.find((user) => user.email?.toLowerCase() === email)
    if (existing) return existing
    if (data.users.length < 100) return null
  }
  throw new Error('Unable to finish searching existing auth users')
}

let authUser = await findExistingUser()
const createdAuthUser = !authUser

if (!authUser) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { booking_access: 'tester' },
  })
  if (error) throw error
  authUser = data.user
} else if (authUser.app_metadata?.booking_access !== 'tester') {
  const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, {
    app_metadata: { ...authUser.app_metadata, booking_access: 'tester' },
  })
  if (error) throw error
  authUser = data.user
}

const provisioned = await provisionTestWorkspace({
  databaseUrl,
  authUserId: authUser.id,
  email,
})

console.log(JSON.stringify({
  createdAuthUser,
  createdWorkspace: provisioned.createdWorkspace,
  authUserId: authUser.id,
  workspaceId: provisioned.workspaceId,
  fixedStudentCount: provisioned.fixedStudentCount,
  email: authUser.email,
  note: '固定資料已預先建立；相對日期的查詢及課堂會在老師首次進入後台時建立。密碼不會顯示在輸出。',
}))
