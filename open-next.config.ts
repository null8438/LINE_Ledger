import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  ...defineCloudflareConfig(),
  // `npm run build` 自体が OpenNext のビルドなので、中で呼ぶ Next.js のビルドは直接指定する
  buildCommand: "npx next build",
};
