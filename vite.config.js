import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    return {
      plugins: [react()],
      build: {
        lib: {
          entry: resolve(process.cwd(), 'src/lib.js'),
          name: 'EfimeramDS',
          formats: ['umd', 'es'],
          fileName: (format) => `efimeramente-ds.${format}.js`,
        },
        cssCodeSplit: false,
        outDir: 'dist',
        rollupOptions: {
          external: ['react', 'react-dom'],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
            },
          },
        },
      },
    }
  }

  // App build (Netlify): split heavy vendors into their own chunks
  // for better caching and to keep the main bundle lean.
  return {
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        // Two HTML shells: index.html (internal panel) and agendar.html (the
        // patient-facing booking pages, served for /agendar + /reservar via
        // netlify.toml rewrites). They share /src/main.jsx, so the JS bundle is
        // emitted once — only the <head> meta differs (public link preview must
        // not leak the "Panel de Control" title).
        input: {
          main: resolve(process.cwd(), 'index.html'),
          agendar: resolve(process.cwd(), 'agendar.html'),
        },
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
  }
})
