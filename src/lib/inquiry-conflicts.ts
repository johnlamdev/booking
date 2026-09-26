export type ConflictInquiry = {
  id: string
  status: string
  startAt: Date
  endAt: Date
}

export type InquiryConflictSummary = {
  /** 起訖時間完全相同的其他待確認查詢數量。 */
  sameTimePendingCount: number
  /** 所有時間有重疊的其他待確認查詢數量，包含完全相同時段。 */
  overlappingPendingCount: number
  /** 是否已經撞到一節已確認課堂。 */
  hasConfirmedConflict: boolean
}

/**
 * 使用已批量取回的查詢，計算每筆待處理查詢的衝突摘要。
 *
 * 相接時段（例如 10:00–11:00 與 11:00–12:00）不算重疊；
 * 每筆目標亦必須排除自己，避免把自己當作另一筆待確認查詢。
 */
export function summarizeInquiryConflicts(
  targets: ConflictInquiry[],
  rows: ConflictInquiry[],
): Record<string, InquiryConflictSummary> {
  return Object.fromEntries(targets.map((target) => {
    const overlapping = rows.filter(
      (row) =>
        row.id !== target.id &&
        row.startAt < target.endAt &&
        target.startAt < row.endAt,
    )
    const pending = overlapping.filter((row) => row.status === 'PENDING')

    return [target.id, {
      sameTimePendingCount: pending.filter(
        (row) =>
          row.startAt.getTime() === target.startAt.getTime() &&
          row.endAt.getTime() === target.endAt.getTime(),
      ).length,
      overlappingPendingCount: pending.length,
      hasConfirmedConflict: overlapping.some((row) => row.status === 'CONFIRMED'),
    }]
  }))
}
