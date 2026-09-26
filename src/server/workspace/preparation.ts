'use server'

import { unstable_rethrow } from 'next/navigation'

import { requireWorkspaceContext } from './context'

export type WorkspacePreparationState = {
  ready?: boolean
  error?: string
} | null

/**
 * 登入後在獨立 request 初始化 workspace，避免 login Server Action 必須等待
 * 整個 dashboard RSC render 才能把第一個畫面交給瀏覽器。
 */
export async function prepareWorkspaceAction(): Promise<WorkspacePreparationState> {
  const startedAt = performance.now()
  try {
    await requireWorkspaceContext()
    console.info(
      `[perf] workspace prepare result=success total_ms=${Math.round(performance.now() - startedAt)}`,
    )
    return { ready: true }
  } catch (error) {
    unstable_rethrow(error)
    console.info(
      `[perf] workspace prepare result=error total_ms=${Math.round(performance.now() - startedAt)}`,
    )
    console.error('[workspace] preparing failed', error instanceof Error ? error.message : 'unknown')
    return { error: '暫時未能準備測試工作室，請按下方按鈕重試。' }
  }
}
