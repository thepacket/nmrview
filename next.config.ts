import type { NextConfig } from "next";

// NMRView runs entirely in the browser, so the production build is a static
// export served by nginx (see Dockerfile and fly.toml).
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
