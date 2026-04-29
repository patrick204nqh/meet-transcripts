import { defineConfig, build } from 'vite'

function backgroundBuild() {
  return {
    name: 'background-build',
    closeBundle: async () => {
      await build({
        configFile: false,
        build: {
          lib: {
            entry: 'src/background/index.ts',
            formats: ['iife'],
            name: 'Background',
          },
          outDir: 'extension',
          emptyOutDir: false,
          minify: false,
          rollupOptions: {
            output: {
              entryFileNames: 'background.js',
            },
          },
        },
      })
    },
  }
}

export default defineConfig({
  plugins: [backgroundBuild()],
  build: {
    lib: {
      entry: 'src/content/content-google-meet.ts',
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
