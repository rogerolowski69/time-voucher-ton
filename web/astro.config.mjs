import path from 'node:path';
import { fileURLToPath } from 'node:url';

import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  integrations: [preact({ compat: true }), tailwind({ applyBaseStyles: false })],
  output: 'static',
  server: {
    port: 4321,
  },
  vite: {
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
        buffer: 'buffer/',
        react: 'preact/compat',
        'react-dom': 'preact/compat',
        'react/jsx-runtime': 'preact/jsx-runtime',
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const host = req.headers.host ?? 'localhost:4321';
              proxyReq.setHeader('X-Forwarded-Host', host);
              proxyReq.setHeader('X-Forwarded-Proto', 'http');
            });
          },
        },
        '/tonconnect-manifest.json': {
          target: 'http://127.0.0.1:8787',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const host = req.headers.host ?? 'localhost:4321';
              proxyReq.setHeader('X-Forwarded-Host', host);
              proxyReq.setHeader('X-Forwarded-Proto', 'http');
            });
          },
        },
      },
    },
  },
});
