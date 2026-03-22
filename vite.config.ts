/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/__tests__/setup.ts'],
  },

  build: {
    target: 'esnext',
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('tldraw')) return 'tldraw'
          if (id.includes('@uiw/react-codemirror') || id.includes('@codemirror/') || id.includes('@lezer/')) return 'codemirror-core'
          if (id.includes('@xterm/')) return 'xterm'
          if (id.includes('react-markdown') || id.includes('remark-math') || id.includes('rehype-katex') || id.includes('rehype-highlight') || id.includes('rehype-sanitize')) return 'markdown'
          if (id.includes('react-pdf')) return 'pdf'
          if (id.includes('lucide-react')) return 'icons'
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
