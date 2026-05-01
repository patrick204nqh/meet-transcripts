import { defineConfig, build } from 'vite'

export default defineConfig(({ mode }) => {
  const isDev = mode !== 'production'

  const extensionScripts = [
    { entry: 'src/background/index.ts',           name: 'Background', output: 'background.js' },
    { entry: 'src/pages/popup/index.ts',           name: 'Popup',       output: 'popup.js' },
    { entry: 'src/pages/meetings/index.ts',       name: 'Meetings',    output: 'meetings.js' },
    { entry: 'src/pages/settings/index.ts',       name: 'Settings',    output: 'settings.js' },
  ]

  function extensionScriptsBuild() {
    return {
      name: 'extension-scripts-build',
      closeBundle: async () => {
        for (const script of extensionScripts) {
          await build({
            configFile: false,
            define: { __DEV__: isDev },
            build: {
              lib: {
                entry: script.entry,
                formats: ['iife'],
                name: script.name,
              },
              outDir: 'extension',
              emptyOutDir: false,
              minify: false,
              rollupOptions: {
                output: {
                  entryFileNames: script.output,
                },
              },
            },
          })
        }
      },
    }
  }

  return {
    plugins: [extensionScriptsBuild()],
    define: { __DEV__: isDev },
    build: {
      lib: {
        entry: 'src/platforms/google-meet/index.ts',
        formats: ['iife'],
        name: 'MeetTranscripts',
      },
      outDir: 'extension',
      emptyOutDir: false,
      minify: false,
      rollupOptions: {
        output: {
          entryFileNames: 'platforms/google-meet.js',
        },
      },
    },
  }
})
