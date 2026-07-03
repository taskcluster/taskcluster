import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import graphql from '@rollup/plugin-graphql';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import remarkGfm from 'remark-gfm';
import rehypePrism from 'rehype-prism-plus';

const port = Number(process.env.PORT) || 5080;
const proxyTarget = process.env.TASKCLUSTER_ROOT_URL || 'http://localhost:3050';
const dir = import.meta.dirname;

// Mirrors generate-env-js.js. During development we serve /static/env.js from
// the current environment; in production the container writes that file at
// startup (it is intentionally not part of the build).
const ENV_VARS = [
  { name: 'APPLICATION_NAME', defaultValue: 'Taskcluster', json: false },
  { name: 'TASKCLUSTER_ROOT_URL', defaultValue: 'https://tc.example.com', json: false },
  { name: 'GRAPHQL_ENDPOINT', defaultValue: '/graphql', json: false },
  { name: 'GRAPHQL_SUBSCRIPTION_ENDPOINT', defaultValue: '/subscription', json: false },
  { name: 'DOCS_ONLY', defaultValue: false, json: false },
  { name: 'UI_LOGIN_STRATEGY_NAMES', defaultValue: '', json: false },
  { name: 'GA_TRACKING_ID', defaultValue: '', json: false },
  { name: 'SENTRY_DSN', defaultValue: '', json: false },
  { name: 'BANNER_MESSAGE', defaultValue: '', json: false },
  { name: 'SITE_SPECIFIC', defaultValue: {}, json: true },
];

const renderEnvJs = () => {
  const env = {};

  for (const { name, defaultValue, json } of ENV_VARS) {
    env[name] = process.env[name]
      ? json
        ? JSON.parse(process.env[name])
        : process.env[name]
      : defaultValue;
  }

  return `window.env = ${JSON.stringify(env, null, 2)}`;
};

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
}));
