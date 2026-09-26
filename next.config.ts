import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 讓同一 Wi‑Fi 的手機可載入 dev client / Server Action 資源。
  // Production 不使用這項設定。
  allowedDevOrigins: ['192.168.0.91'],
};

export default nextConfig;
