import { defineConfig, build } from 'vite'

function backgroundBuild() {
  return {
    name: 'background-build',
    closeBundle: async () => {
      await build({
        configFile: false,
        define: {
          __DEV__: process.env.NODE_ENV !== 'production',
        },
        build: {
          lib: {
            entry: 'src/background/message-handler.ts',
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
  define: {
    __DEV__: process.env.NODE_ENV !== 'production',
  },
  build: {
    lib: {
      entry: 'src/content/google-meet.ts',
      formats: ['iife'],
      name: 'MeetTranscripts',
    },
    outDir: 'extension',
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: 'google-meet.js',
      },
    },
  },
})
