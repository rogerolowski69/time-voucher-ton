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
        '/api': 'http://127.0.0.1:8787',
        '/tonconnect-manifest.json': 'http://127.0.0.1:8787',
      },
    },
  },
});
