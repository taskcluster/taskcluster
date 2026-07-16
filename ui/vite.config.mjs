import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import graphql from '@rollup/plugin-graphql';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import remarkGfm from 'remark-gfm';
import rehypePrism from 'rehype-prism-plus';
import { renderEnvJs } from './generate-env-js.js';

const port = Number(process.env.PORT) || 5080;
const proxyTarget = process.env.TASKCLUSTER_ROOT_URL || 'http://localhost:3050';
const dir = import.meta.dirname;

const envJs = () => ({
  name: 'env-js',
  transformIndexHtml: () => [
    {
      tag: 'script',
      attrs: { src: '/static/env.js' },
      injectTo: 'body-prepend',
    },
  ],
  configureServer(server) {
    server.middlewares.use('/static/env.js', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript');
      res.end(renderEnvJs());
    });
  },
  generateBundle() {
    if (process.env.GENERATE_ENV_JS) {
      this.emitFile({
        type: 'asset',
        fileName: 'static/env.js',
        source: renderEnvJs(),
      });
    }
  },
});

const contributorsrcJson = () => ({
  name: 'all-contributorsrc-json',
  enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('.all-contributorsrc')) {
      return { code: `export default ${code}`, map: null };
    }
  },
});

const stripFrontmatter = () => ({
  name: 'mdx-strip-frontmatter',
  enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('.mdx')) {
      return { code: code.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''), map: null };
    }
  },
});

const docsHtmlFallback = () => ({
  name: 'docs-html-fallback',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.method === 'GET' || req.method === 'HEAD') {
        const path = (req.url || '').split('?')[0];

        if (
          (req.headers.accept || '').includes('text/html') &&
          /^\/docs(\/|$)/.test(path)
        ) {
          req.url = '/docs.html';
        }
      }

      next();
    });
  },
});

const proxy = target => ({ target, changeOrigin: true });

export default defineConfig(({ mode }) => ({
  root: dir,
  resolve: {
    alias: {
      '@taskcluster/ui': resolve(dir, 'src'),
    },
    extensions: ['.mjs', '.jsx', '.js', '.json'],
    dedupe: ['react', 'react-dom'],
  },
  plugins: [
    docsHtmlFallback(),
    contributorsrcJson(),
    stripFrontmatter(),
    {
      enforce: 'pre',
      ...mdx({
        providerImportSource: '@mdx-js/react',
        mdExtensions: [],
        remarkPlugins: [remarkGfm],
        rehypePlugins: [[rehypePrism, { ignoreMissing: true }]],
      }),
    },
    react({
      babel: {
        plugins: [
          ['@babel/plugin-proposal-decorators', { legacy: true }],
          ['@babel/plugin-proposal-class-properties', { loose: false }],
          ...(mode === 'production'
            ? [['transform-react-remove-prop-types', { removeImport: true }]]
            : []),
        ],
      },
    }),
    graphql(),
    nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
    envJs(),
  ],
  server: {
    port,
    allowedHosts: true,
    proxy: {
      '/login': proxy(proxyTarget),
      '/graphql': proxy(proxyTarget),
      '/schemas': proxy(proxyTarget),
      '/references': proxy(proxyTarget),
      '/api/web-server': proxy(proxyTarget),
      '/subscription': {
        target: proxyTarget.replace(/^http(s)?:/, 'ws$1:'),
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'build',
    assetsInlineLimit: 8192,
    rollupOptions: {
      input: {
        index: resolve(dir, 'index.html'),
        docs: resolve(dir, 'docs.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: resolve(dir, 'vitest.setup.js'),
    include: ['src/**/*.test.{js,jsx}'],
  },
}));
