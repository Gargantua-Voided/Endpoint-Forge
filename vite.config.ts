import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import express from 'express';
import { createNsisRouter } from './electron/apiRoutes';

function devApiPlugin() {
  return {
    name: 'dev-api-plugin',
    configureServer(server: any) {
      const apiApp = express();
      apiApp.use(express.json());
      apiApp.use('/api/nsis', createNsisRouter(false));
      server.middlewares.use(apiApp);
    }
  };
}

export default defineConfig({
  base: './', // required for packaged loadFile
  plugins: [react(), tailwindcss(), devApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
