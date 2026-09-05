import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2017',
    chunkSizeWarningLimit: 20000,
    minify: 'esbuild',
    cssMinify: true,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['monaco-editor', '@monaco-editor/react'],
          react: ['react', 'react-dom', 'zustand'],
          xterm: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'zustand', 'monaco-editor', '@monaco-editor/react'],
    exclude: ['electron'],
  },
  esbuild: {
    target: 'es2017',
    legalComments: 'none',
    treeShaking: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { overlay: false },
    watch: {
      ignored: ['**/workspace/**', '**/Desktop/**', '**/tmp/**', '**/release/**', '**/dist/**', '**/.git/**', '**/node_modules/**'],
    },
  },
  clearScreen: false,
});
