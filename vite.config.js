import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { execSync } from 'child_process'

function getBuildInfo() {
  try {
    const commit = execSync('git rev-parse --short HEAD').toString().trim()
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
    return { commit, branch }
  } catch {
    return { commit: 'unknown', branch: 'unknown' }
  }
}

const { commit, branch } = getBuildInfo()
const buildDate = new Date().toISOString().slice(0, 10)

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(commit),
    __BUILD_BRANCH__: JSON.stringify(branch),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  plugins: [vue()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**', 'electron/**'],
      exclude: ['src/main.js']
    }
  }
})
