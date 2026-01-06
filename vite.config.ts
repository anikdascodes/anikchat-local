import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'favicon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'AnikChat',
        short_name: 'AnikChat',
        description: 'Secure local-first AI chat with your own API keys',
        theme_color: '#000000',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            // Don't cache API calls
            urlPattern: /^https:\/\/api\./i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: mode === 'development',
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React - always needed
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // UI components
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tooltip', '@radix-ui/react-scroll-area', '@radix-ui/react-select', '@radix-ui/react-tabs'],
          // Markdown rendering - lazy loaded
          'markdown': ['react-markdown', 'remark-gfm'],
          // Code highlighting - lazy loaded
          'syntax': ['react-syntax-highlighter'],
          // Heavy optional features - lazy loaded
          'math': ['katex', 'rehype-katex', 'remark-math'],
          // Vector search - lazy loaded only when needed
          'embeddings': ['client-vector-search'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
    exclude: ['client-vector-search'], // Don't pre-bundle heavy optional deps
  },
}));
