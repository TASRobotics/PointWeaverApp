import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // relative asset paths: the built app is opened from disk (file://) by electron/main.cjs
  base: './',
})
