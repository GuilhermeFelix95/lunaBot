import { resolve } from "node:path";
import solidPlugin from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const rendererPort = readRendererPort(process.env.LUNABOT_DEV_RENDERER_PORT);

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@lunabot/contracts"] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["@lunabot/contracts"] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/preload/index.ts"),
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    plugins: [solidPlugin(), tailwindcss({ optimize: false })],
    resolve: {
      dedupe: ["solid-js", "@solidjs/web"],
    },
    server: rendererPort ? { port: rendererPort, strictPort: true } : undefined,
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/renderer/index.html"),
          browserPip: resolve("src/renderer/browser-pip.html"),
          browserPipControls: resolve("src/renderer/browser-pip-controls.html"),
        },
      },
    },
  },
});

function readRendererPort(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error("LUNABOT_DEV_RENDERER_PORT must be an integer from 1024 to 65535.");
  }
  return port;
}
