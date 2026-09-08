import {writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
// The Vite plugin, never the play CDN: that ships a <script> tag that fetches
// Tailwind at runtime, which is a network call this app must not make (C6).
import tailwindcss from '@tailwindcss/vite'

// This package is ESM ("type": "module"), so __dirname does not exist here.
const here = fileURLToPath(new URL('.', import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // main.go does //go:embed all:frontend/dist, so that directory has to
      // exist for the Go build to compile - on a fresh clone it holds nothing
      // but this placeholder. Vite empties dist on every build, which deletes
      // it. Rather than stop Vite cleaning up (which would leave stale bundles
      // to be embedded into the shipped binary), let it clean and put the
      // placeholder back afterwards.
      name: 'keep-dist-placeholder',
      closeBundle() {
        writeFileSync(resolve(here, 'dist/gitkeep'), '')
      },
    },
  ],
})
