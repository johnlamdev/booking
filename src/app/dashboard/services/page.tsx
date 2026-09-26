import type { Metadata } from 'next'

import { ServiceForm } from '@/components/service-form'
import { Button, Card } from '@/components/ui'
import { setServiceStatusAction } from '@/server/services/actions'
import { listServices } from '@/server/services/queries'
import { requireWorkspaceContext } from '@/server/workspace/context'

export const metadata: Metadata = { title: '服務' }

export default async function ServicesPage() {
  const ctx = await requireWorkspaceContext()
  const services = await listServices(ctx.workspaceId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-brand">設定</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">服務</h1>
        <p className="mt-1 text-sm text-ink-muted">
          你提供的課堂種類。每節長度會用於把開放時間切成可預約的時段。
        </p>
      </div>

      <section aria-labelledby="service-list-heading" className="flex flex-col gap-3">
        <h2 id="service-list-heading" className="text-sm font-semibold text-ink">
          現有服務
        </h2>

        {services.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-muted">
              還沒有任何服務。先在下方建立一項，才能開放可預約時段。
            </p>
          </Card>
        ) : (
          services.map((service) => (
            <Card key={service.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-ink">{service.name}</h3>
                    {/* 狀態以文字標示，不單靠顏色 */}
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        service.status === 'ACTIVE'
                          ? 'border-brand/30 bg-brand/5 text-brand-strong'
                          : 'border-line bg-canvas text-ink-subtle'
                      }`}
                    >
                      {service.status === 'ACTIVE' ? '啟用中' : '已停用'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">每節 {service.durationMinutes} 分鐘</p>
                  {service.description && (
                    <p className="mt-1 text-sm text-ink-subtle">{service.description}</p>
                  )}
                </div>

                <form action={setServiceStatusAction}>
                  <input type="hidden" name="serviceId" value={service.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={service.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}
                  />
                  <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs">
                    {service.status === 'ACTIVE' ? '停用' : '重新啟用'}
                  </Button>
                </form>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-brand">編輯</summary>
                <div className="mt-3 border-t border-line pt-3">
                  <ServiceForm service={service} />
                </div>
              </details>
            </Card>
          ))
        )}

        <p className="text-xs text-ink-subtle">
          停用服務不會刪除任何已建立的時段或紀錄，只是不再接受新的時段與查詢。
        </p>
      </section>

      <details className="group rounded-2xl border border-line bg-surface shadow-[0_8px_30px_rgb(23_33_29/0.04)]" open={services.length === 0}>
        <summary id="service-create-heading" className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-brand marker:hidden">
          ＋ 新增服務
        </summary>
        <div className="border-t border-line p-5"><ServiceForm /></div>
      </details>
    </div>
  )
}
