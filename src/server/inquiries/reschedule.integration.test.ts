import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { generateStatusToken, hashStatusToken } from '@/lib/token'
import { db } from '@/server/db'
import { bookingInquiries, rescheduleProposals, services } from '@/server/db/schema'
import { getAvailableSlots, getWorkspacePreviewProfile } from '@/server/public/queries'
import { bootstrapPersonalWorkspace } from '@/server/workspace/bootstrap'

import { cancelConfirmedInquiryByStudent } from './confirm'
import { acceptReschedule, declineReschedule, proposeReschedule } from './reschedule'

afterAll(async () => {
  await db.$client.end({ timeout: 5 })
})

describe('reschedule', () => {
  it('保留原時段直到學生接受，接受後原筆預約改到新時間且不能重複接受', async () => {
    const authUserId = randomUUID()
    const workspace = await bootstrapPersonalWorkspace({ authUserId, email: `${authUserId}@example.com` })
    const profile = await getWorkspacePreviewProfile(workspace.workspaceId)
    expect(profile).not.toBeNull()
    const [service] = await db.select().from(services).where(eq(services.workspaceId, workspace.workspaceId)).limit(1)
    const slots = await getAvailableSlots({ profile: profile!, durationMinutes: service!.durationMinutes, days: 7 })
    expect(slots.length).toBeGreaterThan(1)

    const original = slots[0]!
    const next = slots.find((slot) => slot.startAt.getTime() > original.endAt.getTime())!
    const statusToken = generateStatusToken()
    const [booking] = await db.insert(bookingInquiries).values({
      workspaceId: workspace.workspaceId,
      instructorId: workspace.instructorProfileId,
      serviceId: service!.id,
      startAt: original.startAt,
      endAt: original.endAt,
      studentName: '學生',
      studentPhone: '+85291234567',
      status: 'CONFIRMED',
      statusTokenHash: hashStatusToken(statusToken),
      idempotencyKey: randomUUID(),
    }).returning({ id: bookingInquiries.id })

    const proposal = await proposeReschedule({
      workspaceId: workspace.workspaceId,
      bookingId: booking!.id,
      proposedStartAt: next.startAt,
      initiatedBy: 'INSTRUCTOR',
    })
    expect(proposal.ok).toBe(true)
    const [before] = await db.select().from(bookingInquiries).where(eq(bookingInquiries.id, booking!.id))
    expect(before!.startAt).toEqual(original.startAt)
    const beforeSlots = await getAvailableSlots({ profile: profile!, durationMinutes: service!.durationMinutes, days: 7 })
    expect(beforeSlots.some((slot) => slot.startAt.getTime() === original.startAt.getTime())).toBe(false)
    expect(beforeSlots.some((slot) => slot.startAt.getTime() === next.startAt.getTime())).toBe(true)

    const [firstProposal] = await db.select().from(rescheduleProposals).where(eq(rescheduleProposals.bookingInquiryId, booking!.id))
    expect((await declineReschedule(firstProposal!.id)).ok).toBe(true)
    const [afterWithdrawal] = await db.select().from(bookingInquiries).where(eq(bookingInquiries.id, booking!.id))
    expect(afterWithdrawal!.startAt).toEqual(original.startAt)
    expect((await proposeReschedule({ workspaceId: workspace.workspaceId, bookingId: booking!.id, proposedStartAt: next.startAt, initiatedBy: 'INSTRUCTOR' })).ok).toBe(true)
    const [record] = await db.select().from(rescheduleProposals).where(and(
      eq(rescheduleProposals.bookingInquiryId, booking!.id), eq(rescheduleProposals.status, 'PENDING'),
    ))
    const accepted = await acceptReschedule({ proposalId: record!.id, actorType: 'STUDENT' })
    expect(accepted.ok).toBe(true)
    const [after] = await db.select().from(bookingInquiries).where(eq(bookingInquiries.id, booking!.id))
    expect(after!.startAt).toEqual(next.startAt)
    expect(after!.status).toBe('CONFIRMED')
    const afterSlots = await getAvailableSlots({ profile: profile!, durationMinutes: service!.durationMinutes, days: 7 })
    expect(afterSlots.some((slot) => slot.startAt.getTime() === original.startAt.getTime())).toBe(true)
    expect(afterSlots.some((slot) => slot.startAt.getTime() === next.startAt.getTime())).toBe(false)
    expect((await acceptReschedule({ proposalId: record!.id, actorType: 'STUDENT' })).ok).toBe(false)

    const cancelled = await cancelConfirmedInquiryByStudent({
      inquiryId: booking!.id,
      statusTokenHash: hashStatusToken(statusToken),
      reason: '學生有事',
    })
    expect(cancelled.ok).toBe(true)
    const [final] = await db.select().from(bookingInquiries).where(eq(bookingInquiries.id, booking!.id))
    expect(final!.status).toBe('CANCELLED')
  })
})
