import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;

// `next dev` でも Cloudflare のバインディング（ローカルの D1）を使えるようにする
initOpenNextCloudflareForDev();
