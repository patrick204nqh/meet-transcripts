import { defineConfig, build } from 'vite'

export default defineConfig(({ mode }) => {
  const isDev = mode !== 'production'

  function backgroundBuild() {
    return {
      name: 'background-build',
      closeBundle: async () => {
        await build({
          configFile: false,
          define: {
            __DEV__: isDev,
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

  return {
    plugins: [backgroundBuild()],
    define: {
      __DEV__: isDev,
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
  }
})
