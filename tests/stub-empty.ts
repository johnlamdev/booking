// `server-only` 套件在 React Server Component 以外的環境會直接 throw。
// 整合測試在 Node 直接呼叫 server 模組，故以此空模組取代（見 vitest.integration.config.ts）。
export {}
