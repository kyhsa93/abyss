import { defineConfig } from 'vite'

// GitHub Pages serves this project from /abyss/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/abyss/' : '/',
  build: { target: 'es2022' },
})
