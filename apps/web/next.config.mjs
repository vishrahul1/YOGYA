/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep production builds separate from the dev server cache. Running
  // `next build` while `next dev` is open would otherwise replace `.next`
  // and leave the browser requesting CSS/JS chunks that no longer exist.
  distDir:
    process.env.NODE_ENV === "production" && !process.env.VERCEL
      ? ".next-build"
      : ".next",
};

export default nextConfig;
