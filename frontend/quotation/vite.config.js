import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Emits version.json (a build id the running app was loaded with) so an
// already-open tab can notice a newer build exists on the server — see
// useVersionCheck.js. Every build gets its own id since Vite's content-hashed
// JS/CSS filenames only help a *fresh* page load; a tab that's been open
// since before a deploy keeps running its original in-memory bundle
// indefinitely and never re-requests those files at all.
function versionFilePlugin() {
  return {
    name: 'emit-version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFilePlugin()],  // 👈 Note: Added react() plugin (you had tailwindcss only)
  
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