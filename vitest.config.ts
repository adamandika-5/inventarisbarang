import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
    // Exclude E2E tests from Vitest
    exclude: ['node_modules', 'dist', '.next', 'src/test/e2e/**'],
  },
  resolve: {
    alias: {
      '@': resolve(process.cwd(), './src'),
    },
  },
})
