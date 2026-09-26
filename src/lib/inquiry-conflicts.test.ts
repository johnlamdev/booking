import { describe, expect, it } from 'vitest'

import { summarizeInquiryConflicts, type ConflictInquiry } from './inquiry-conflicts'

function inquiry(
  id: string,
  status: string,
  start: string,
  end: string,
): ConflictInquiry {
  return { id, status, startAt: new Date(start), endAt: new Date(end) }
}

describe('summarizeInquiryConflicts', () => {
  it('分辨同時段、部分重疊、相接時段及已確認衝突', () => {
    const target = inquiry('target', 'PENDING', '2027-06-01T02:00:00Z', '2027-06-01T03:00:00Z')
    const rows = [
      target,
      inquiry('same', 'PENDING', '2027-06-01T02:00:00Z', '2027-06-01T03:00:00Z'),
      inquiry('partial', 'PENDING', '2027-06-01T02:30:00Z', '2027-06-01T03:30:00Z'),
      inquiry('adjacent', 'PENDING', '2027-06-01T03:00:00Z', '2027-06-01T04:00:00Z'),
      inquiry('confirmed', 'CONFIRMED', '2027-06-01T01:30:00Z', '2027-06-01T02:15:00Z'),
      inquiry('rejected', 'REJECTED', '2027-06-01T02:00:00Z', '2027-06-01T03:00:00Z'),
    ]

    expect(summarizeInquiryConflicts([target], rows)).toEqual({
      target: {
        sameTimePendingCount: 1,
        overlappingPendingCount: 2,
        hasConfirmedConflict: true,
      },
    })
  })

  it('逐筆計算並排除目標本身', () => {
    const first = inquiry('first', 'PENDING', '2027-06-01T02:00:00Z', '2027-06-01T03:00:00Z')
    const second = inquiry('second', 'PENDING', '2027-06-01T02:00:00Z', '2027-06-01T03:00:00Z')

    expect(summarizeInquiryConflicts([first, second], [first, second])).toEqual({
      first: {
        sameTimePendingCount: 1,
        overlappingPendingCount: 1,
        hasConfirmedConflict: false,
      },
      second: {
        sameTimePendingCount: 1,
        overlappingPendingCount: 1,
        hasConfirmedConflict: false,
      },
    })
  })

  it('沒有目標時回傳空結果', () => {
    expect(summarizeInquiryConflicts([], [])).toEqual({})
  })
})
