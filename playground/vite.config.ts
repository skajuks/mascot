import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const src = (path: string) => fileURLToPath(new URL(`../src/${path}`, import.meta.url))

// The playground imports the library by its package name, straight from source.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^mascot\/react$/, replacement: src('react/index.tsx') },
      { find: /^mascot$/, replacement: src('index.ts') },
    ],
  },
})
