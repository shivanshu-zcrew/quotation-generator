import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],  // 👈 Note: Added react() plugin (you had tailwindcss only)
  
  server: {
    host: '0.0.0.0',    // 👈 ADD THIS - allows network access
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})