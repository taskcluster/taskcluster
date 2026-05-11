import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import mdx from '@mdx-js/rollup';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import remarkGfm from 'remark-gfm';
import rehypePrism from 'rehype-prism-plus';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import graphql from '@rollup/plugin-graphql';
import generateEnvJs from './generate-env-js.js';

const DEFAULT_PORT = 5080;
const SRC_DIR = path.join(__dirname, 'src');
const STATIC_DIR = path.join(SRC_DIR, 'static');
const port = process.env.PORT || DEFAULT_PORT;
const proxyTarget = process.env.TASKCLUSTER_ROOT_URL || 'http://localhost:3050';
const serverProxyConfig = {
  '/login': {
    target: proxyTarget,
    changeOrigin: true,
  },
  '/graphql': {
    target: proxyTarget,
    changeOrigin: true,
    configure: (proxy, _options) => {
      proxy.on('error', (err, _req, _res) => {
        console.log('[graphql proxy error]', err);
      });
      proxy.on('proxyRes', (proxyRes, req, _res) => {
        if (proxyRes.statusCode >= 400) {
          console.log('[graphql proxy error]', proxyRes.statusCode, req.method, req.url);
        }
      });
    },
  },
  '/schemas': {
    target: proxyTarget,
    changeOrigin: true,
  },
  '/references': {
    target: proxyTarget,
    changeOrigin: true,
  },
  '/subscription': {
    ws: true,
    changeOrigin: true,
    target: proxyTarget.replace(/^http(s)?:/, 'ws$1:'),
  },
  '/api/web-server': {
    target: proxyTarget,
    changeOrigin: true,
  },
};

/**
 * https://vitejs.dev/config/
 *
 * @var options Object
 * @var options.mode string "development"|"production"
 * @var options.command string "build"|"serve"
 * @var options.ssrBuild boolean
 */
function generateEnvJsPlugin(mode) {
  return {
    name: 'generate-env-js',
    buildStart() {
      if (mode !== 'test') {
        generateEnvJs(path.join(STATIC_DIR, 'env.js'));
      }
    },
  };
}

// Plugin to handle .all-contributorsrc file as JSON
function allContributorsPlugin() {
  return {
    name: 'all-contributors',
    load(id) {
      if (id.endsWith('.all-contributorsrc')) {
        // Read the file and parse as JSON
        const content = fs.readFileSync(id, 'utf-8');
        const json = JSON.parse(content);
        // Return as ES module export
        return {
          code: `export default ${JSON.stringify(json)};`,
          map: null,
        };
      }
    },
  };
}

export default ({ mode }) => {
  if (mode === 'development') {
    generateEnvJs(path.join(STATIC_DIR, 'env.js'));
  }

  return defineConfig({
    plugins: [
      generateEnvJsPlugin(mode),
      allContributorsPlugin(),
      reactVirtualized(),
      historyFallback(),
      graphql(),
      mdx({
        include: ['docs/**/*.{md,mdx}'],
        providerImportSource: '@mdx-js/react',
        remarkPlugins: [
          remarkFrontmatter,
          [remarkMdxFrontmatter, { name: 'frontmatter' }],
          remarkGfm,
        ],
        rehypePlugins: [rehypePrism],
      }),
      react({
        babel: {
          plugins: [
            ['@babel/plugin-proposal-decorators', { legacy: true }],
          ],
        },
      }),
    ],
    server: {
      port,
      proxy: serverProxyConfig,
      allowedHosts: ['.taskcluster', 'taskcluster', 'localhost'],
    },
    resolve: {
      alias: [
        {
          find: '~@fontsource',
          replacement: path.join(__dirname, 'node_modules', '@fontsource'),
        },
        {
          find: '@taskcluster/ui',
          replacement: path.join(__dirname, 'src'),
        },
        {
          find: 'react/jsx-runtime',
          replacement: path.join(__dirname, 'node_modules/react/jsx-runtime.js'),
        },
        {
          find: 'react/jsx-dev-runtime',
          replacement: path.join(__dirname, 'node_modules/react/jsx-dev-runtime.js'),
        },
        // Node.js built-in module polyfills
        { find: 'path', replacement: 'path-browserify' },
        { find: 'crypto', replacement: 'crypto-browserify' },
        { find: 'stream', replacement: 'stream-browserify' },
        { find: 'http', replacement: 'stream-http' },
        { find: 'https', replacement: 'https-browserify' },
        { find: 'zlib', replacement: 'browserify-zlib' },
        { find: 'util', replacement: 'util' },
        { find: 'url', replacement: 'url' },
        { find: 'buffer', replacement: 'buffer' },
        { find: 'vm', replacement: 'vm-browserify' },
        { find: 'querystring', replacement: 'querystring-es3' },
      ],
      dedupe: ['react', 'react-dom'],
    },
    build: {
      outDir: 'build',
      chunkSizeWarningLimit: 3500,
      rollupOptions: {
        input: {
          main: path.join(__dirname, 'index.html'),
          docs: path.join(__dirname, 'docs/index.html'),
        },
        onwarn(warning, warn) {
          if (warning.code === 'EVAL' && warning.id?.includes('vm-browserify')) {
            return;
          }
          warn(warning);
        },
      },
    },
    optimizeDeps: {
      include: ['path-browserify'],
      exclude: ['build/*', 'dist/*'],
      entries: ['index.html', 'docs/index.html'],
      esbuildOptions: {
        plugins: [
          NodeGlobalsPolyfillPlugin({
            buffer: true,
          }),
        ],
        loader: {
          '.jsx': 'tsx',
        },
      },
    },
    define: {
      'process.env': '{}',
      global: 'globalThis',
    },
  });
};

function historyFallback() {
  return {
    name: 'history-fallback',
    configureServer(server) {
      return () => {
        server.middlewares.use((req, _res, next) => {
          if (req.url && req.url.startsWith('/docs') &&
              !req.url.includes('.') &&
              req.headers.accept?.includes('text/html')) {
            req.url = '/docs/index.html';
          }
          next();
        });
      };
    },
  };
}

// https://github.com/bvaughn/react-virtualized/issues/1722
const WRONG_CODE = 'import { bpfrpt_proptype_WindowScroller } from "../WindowScroller.js";';

export function reactVirtualized() {
  return {
    name: "my:react-virtualized",
    buildStart() {
      // Fix both the main react-virtualized and the one in react-lazylog
      const filesToFix = [
        path.join(__dirname, 'node_modules/react-virtualized/dist/es/WindowScroller/utils/onScroll.js'),
        path.join(__dirname, 'node_modules/react-lazylog/node_modules/react-virtualized/dist/es/WindowScroller/utils/onScroll.js'),
      ];

      filesToFix.forEach(onScrollFile => {
        try {
          const code = fs.readFileSync(onScrollFile, "utf-8");

          if (code.includes(WRONG_CODE)) {
            fs.writeFileSync(onScrollFile, code.replace(WRONG_CODE, ""));
          }
        } catch {
          // File missing or unwritable — ignore.
        }
      });
    },
  }
}
