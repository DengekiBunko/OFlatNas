import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import { partytownVite } from "@builder.io/partytown/utils";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isWindows = process.platform === "win32";
  const devHost = process.env.VITE_DEV_HOST?.trim() || "127.0.0.1";
  // Vercel / Docker 构建时输出到 dist
  const isVercel = process.env.VERCEL === "1";
  const isDockerBuild = process.env.VITE_DOCKER_BUILD === "1";
  const serverPublicDirAbs = fileURLToPath(new URL("../server/public", import.meta.url));
  const publicDir = isDockerBuild || isVercel
    ? "../server/public"
    : isWindows
      ? "../server/public"
      : "../debian/server/public";
  const outDir = isDockerBuild || isVercel
    ? "dist"
    : isWindows
      ? serverPublicDirAbs
      : "dist";
  return ({
    base: "/",
    publicDir,
    build: {
      sourcemap: false,
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        // 避免 UNRESOLVED_IMPORT 被 Vite 转为 throw（依赖中若存在 commonjs external 等会触发）
        onwarn(warning, warn) {
          if (warning.code === "UNRESOLVED_IMPORT") return;
          if (typeof warning.message === "string" && warning.message.includes("external")) return;
          warn(warning);
        },
      },
    },
    plugins: [
      vue(),
      mode === "development" && vueDevTools(),
      partytownVite({
        dest: fileURLToPath(new URL("./dist/~partytown", import.meta.url)),
      }),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: 23000,
      host: devHost,
      watch: {
        ignored: ["**/data/**", "**/server/**"],
        usePolling: isWindows,
        interval: isWindows ? 180 : undefined,
      },
    },
  })
});
