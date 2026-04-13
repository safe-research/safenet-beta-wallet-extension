import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Separate build for the content script.
// Content scripts injected via manifest cannot use ES module imports in
// Chrome/Brave, so this build produces a self-contained IIFE with all
// dependencies inlined rather than split into shared chunks.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content.ts'),
      formats: ['iife'],
      name: 'SafenetBetaContent',
      fileName: () => 'content.js',
    },
  },
})
