import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import svgr from "vite-plugin-svgr";
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [ svgr(), react(), tsconfigPaths({root: __dirname})],
  resolve: {
    alias: {
      $fonts: resolve('./src/vendor/fonts'),
      $assets: resolve('./src/assets'),
    }
  },
  server: { proxy: { '/api': { target: 'http://localhost:3000', rewrite: (url) => url.replace(/^\/api/, '') } } },
  build: {
    assetsInlineLimit:0,
  },
  css: {
    preprocessorOptions: {
      scss: {
        loadPaths: [resolve('.')],
        additionalData: `
          @use "./src/scss/variables" as *;
          @use "./src/scss/mixins";
        `,
      },

    }
  },

})
