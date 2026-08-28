import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // main.go does //go:embed all:frontend/dist, so the directory and its
    // placeholder must survive a build. Vite empties dist by default, which
    // deletes gitkeep and leaves a fresh clone unable to compile the Go side.
    emptyOutDir: false,
  },
})
