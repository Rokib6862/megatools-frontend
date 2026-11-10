import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  const API_URL = process.env.VITE_API_URL || 'http://localhost:5000';

  return {
    plugins: [react()],
    css: { postcss: { plugins: [] } },

    server: {
      port: 5173,
      strictPort: false,
      open: false,
      hmr: {
        overlay: false,
      },
      watch: {
        ignored: ['**/AuthContext.jsx', '**/contexts/**'],
      },
      proxy: {
        '/api': {
          target: API_URL,
          changeOrigin: true,
          secure: false,
          cookieDomainRewrite: 'localhost',
        },
        '/socket.io': {
          target: API_URL,
          changeOrigin: true,
          secure: false,
          ws: true,
          timeout: 60000,
        },
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: false,
      minify: 'terser',
      target: 'es2020',
      chunkSizeWarningLimit: 500,
      assetsInlineLimit: 4096,
      terserOptions: {
        compress: {
          drop_console: isProduction,
          drop_debugger: isProduction,
          pure_funcs: isProduction ? ['console.log', 'console.debug'] : [],
        },
      },
      rollupOptions: {
        output: {
          // ENTERPRISE: Clean manual chunk splitting (removed dead packages)
          manualChunks: {
            // Core React + Router (always needed)
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],

            // Socket.IO (real-time)
            'socket-vendor': ['socket.io-client'],

            // HTTP Client + Utilities
            'utils-vendor': ['axios', 'date-fns'],
          },
          // Custom chunk naming for better cache
          chunkFileNames: (chunkInfo) => {
            if (chunkInfo.name.includes('vendor')) {
              return `assets/[name]-[hash].js`;
            }
            return `assets/[name]-[hash].js`;
          },
          // ENTERPRISE: Preload hints for critical chunks
          experimentalMinChunkSize: 10000,
        },
      },
    },

    // ENTERPRISE: Optimize dependencies
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'lucide-react',
        'axios',
        'date-fns',
        'socket.io-client',
      ],
    },

    // ENTERPRISE: Environment variables
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '3.0.0'),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
  };
});