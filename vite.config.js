import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'serve-bundled-reimbursement',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const requestUrl = new URL(req.url || '/', 'http://localhost');
          if (!requestUrl.pathname.startsWith('/tools/reimbursement/')) return next();
          const relative = decodeURIComponent(requestUrl.pathname.slice('/tools/reimbursement/'.length));
          let filePath = path.resolve('public/tools/reimbursement', relative || 'index.html');
          const root = path.resolve('public/tools/reimbursement');
          if (!filePath.startsWith(root)) {
            res.statusCode = 403;
            return res.end('Forbidden');
          }
          if (relative === '' || relative.endsWith('/')) filePath = path.join(filePath, 'index.html');
          if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            filePath = path.join(root, 'index.html');
          }
          const mime = {
            '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
            '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
            '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
            '.ttf': 'font/ttf', '.wasm': 'application/wasm'
          }[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
          res.setHeader('Content-Type', mime);
          fs.createReadStream(filePath).pipe(res);
        });
      }
    },
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: '基地工作台',
        short_name: '基地工作台',
        description: '工作日志、设备台账与基地模块入口',
        lang: 'zh-CN',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f4f7f3',
        theme_color: '#f4f7f3',
        icons: [
          {
            src: './icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: './icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        globIgnores: ['tools/**/*'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    fs: { deny: ['public/tools/**'] }
  },
  optimizeDeps: {
    exclude: ['@emotion/is-prop-valid']
  }
});
