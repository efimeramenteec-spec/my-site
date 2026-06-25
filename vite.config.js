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

  return {
    plugins: [react()],
  }
})
