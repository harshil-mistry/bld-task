/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disabled so the WebSocket effect doesn't double-connect in dev (cleaner demo behavior).
  reactStrictMode: false,
};

module.exports = nextConfig;
