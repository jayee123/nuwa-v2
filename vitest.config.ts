import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Unit tests（vitest）與 E2E（playwright.*.config.ts）分開：
// include 限定 *.test.ts，不會吃到 e2e/ 的 *.spec.ts。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
