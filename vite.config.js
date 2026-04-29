import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/content-google-meet.ts',
      formats: ['iife'],
      name: 'MeetTranscripts',
    },
    outDir: 'extension',
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: 'content-google-meet.js',
      },
    },
  },
})
