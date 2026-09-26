import Link from 'next/link'

import { StudentForm } from '@/components/student-form'

export default function NewStudentPage() {
  return <main className="mx-auto max-w-2xl px-4 py-8"><Link href="/dashboard/students" className="text-sm text-zinc-600">← 返回學生</Link><h1 className="mt-5 text-2xl font-semibold">新增學生</h1><p className="mt-2 text-sm text-zinc-600">之後收到相同 WhatsApp 號碼的查詢，會自動放到這位學生的紀錄。</p><div className="mt-7 rounded-2xl border border-zinc-200 bg-white p-5"><StudentForm /></div></main>
}
