import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // simulate a browser (document, localStorage, …) inside Node
    environment: 'jsdom',
    // let tests use describe/it/expect without importing them
    globals: true,
    // runs before every test file (loads the extra DOM matchers)
    setupFiles: './src/test/setup.js',
    // keep localStorage etc. isolated between test files
    restoreMocks: true,
  },
})
