// Static export, no server code. The seal module is linked from ../packages/seal (ESM, ships dist);
// its tlock-js dependency is CommonJS and uses the "buffer" package (resolved from the seal module).
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["@sealhour/seal"],
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // One copy of ethers and age-encryption for the app and the seal module.
      ethers$: path.join(here, "node_modules/ethers/lib.esm/index.js"),
      "age-encryption$": require.resolve("age-encryption"),
    };
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        fs: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
};

export default nextConfig;
