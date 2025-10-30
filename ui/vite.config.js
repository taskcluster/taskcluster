import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import Markdown from 'vite-plugin-react-markdown';
import viteTsconfigPaths from 'vite-tsconfig-paths';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import nodePolyfills from 'rollup-plugin-node-polyfills';
import gql from 'vite-plugin-simple-gql';
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
// Plugin to generate env.js before build starts
function generateEnvJsPlugin() {
  return {
    name: 'generate-env-js',
    buildStart() {
      if (process.env.GENERATE_ENV_JS) {
        generateEnvJs(path.join(STATIC_DIR, 'env.js'));
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
      generateEnvJsPlugin(),
      reactVirtualized(),
      historyFallback(),
      gql(),
      viteTsconfigPaths(),
      Markdown({
        wrapperClasses: 'markdown-body',
        markdownItOptions: {
          html: true,
          linkify: true,
          typographer: true,
        },
      }),
      react({
        include: [/\.(jsx?|tsx?)$/],
        babel: {
          plugins: [
            ['@babel/plugin-proposal-decorators', { legacy: true }],
            ['@babel/plugin-proposal-class-properties', { loose: false }],
          ],
        },
      }),
    ],
    esbuild: {
      loader: 'tsx',
      include: /src\/.*\.(jsx?|tsx?)$/,
      exclude: [],
    },
    assetsInclude: ['**/*.mdx', '**/*.md'],
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
          find: 'taskcluster-ui',
          replacement: path.join(__dirname, 'src'),
        },
        // Node.js built-in module polyfills
        { find: 'crypto', replacement: 'crypto-browserify' },
        { find: 'stream', replacement: 'stream-browserify' },
        { find: 'http', replacement: 'stream-http' },
        { find: 'https', replacement: 'https-browserify' },
        { find: 'zlib', replacement: 'browserify-zlib' },
        { find: 'util', replacement: 'util' },
        { find: 'url', replacement: 'url-polyfill' },
        { find: 'buffer', replacement: 'buffer' },
        { find: 'vm', replacement: 'vm-browserify' },
        { find: 'querystring', replacement: 'querystring-es3' },
        { find: 'process', replacement: 'process/browser' },
      ],
    },
    build: {
      chunkSizeWarningLimit: 3500,
      rollupOptions: {
        input: {
          main: path.join(__dirname, 'index.html'),
          docs: path.join(__dirname, 'docs/index.html'),
        },
        plugins: [nodePolyfills()],
        external: [
          // Node.js-only modules that don't have browser equivalents
          'net',
          'tls',
          'fs',
          'os',
          'path',
        ],
        onwarn(warning, warn) {
          // Suppress eval warning from vm-browserify - it's a necessary polyfill
          if (warning.code === 'EVAL' && warning.id?.includes('vm-browserify')) {
            return;
          }
          // Suppress externalization warnings - we've handled these with polyfills and externals
          if (warning.code === 'UNRESOLVED_IMPORT' || warning.message?.includes('externalized for browser compatibility')) {
            return;
          }
          warn(warning);
        },
        output: {
          preserveModules: false,
          manualChunks: (id) => {
            // Split large vendor dependencies into separate chunks
            if (id.includes('node_modules')) {
              // Material-UI packages
              if (id.includes('@material-ui')) {
                return 'vendor-material-ui';
              }
              // React and related packages
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'vendor-react';
              }
              // Apollo GraphQL packages
              if (id.includes('apollo') || id.includes('graphql')) {
                return 'vendor-apollo';
              }
              // Code editor packages
              if (id.includes('codemirror') || id.includes('prism')) {
                return 'vendor-editor';
              }
              // Virtualization packages
              if (id.includes('react-virtualized') || id.includes('react-window') || id.includes('react-lazylog')) {
                return 'vendor-virtualized';
              }
              // Date/time packages
              if (id.includes('date-fns')) {
                return 'vendor-date';
              }
              // Utility packages
              if (id.includes('ramda') || id.includes('lodash')) {
                return 'vendor-utils';
              }
              // MDI icons
              if (id.includes('mdi-react')) {
                return 'vendor-icons';
              }
              // Markdown/MDX packages
              if (id.includes('markdown') || id.includes('mdx') || id.includes('remark') || id.includes('rehype')) {
                return 'vendor-markdown';
              }
              // Taskcluster client packages
              if (id.includes('@taskcluster') || id.includes('taskcluster-')) {
                return 'vendor-taskcluster';
              }
              // Babel and related
              if (id.includes('@babel') || id.includes('core-js')) {
                return 'vendor-babel';
              }
              // Validation libraries
              if (id.includes('ajv') || id.includes('json-schema')) {
                return 'vendor-validation';
              }
              // Other vendor packages
              return 'vendor-other';
            }
          },
        },
      },
    },
    optimizeDeps: {
      exclude: ['build/*', 'dist/*'],
      entries: ['index.html', 'docs/index.html'],
      esbuildOptions: {
        // Node.js global to browser globalThis
        define: {
          global: 'globalThis',
          'process.env': '{}',
        },
        // Enable esbuild polyfill plugins
        plugins: [
          NodeGlobalsPolyfillPlugin({
            buffer: true,
            process: true,
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

// History fallback middleware for multi-page app routing
function historyFallback() {
  return {
    name: 'history-fallback',
    configureServer(server) {
      // Return a function to run before Vite's built-in middleware
      return () => {
        server.middlewares.use((req, _res, next) => {
          const originalUrl = req.url;
          // For /docs paths, rewrite URL to /docs/index.html so Vite serves the correct entry point
          // But only if it's not requesting a specific asset
          if (originalUrl && originalUrl.startsWith('/docs') &&
              !originalUrl.includes('.') &&
              req.headers.accept?.includes('text/html')) {
            // Rewrite the URL to point to the docs entry point
            req.url = '/docs/index.html';
          }
          next();
        });
      };
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // If the original URL was /docs but we're serving the wrong HTML, fix it
        if (ctx.originalUrl?.startsWith('/docs') && !ctx.originalUrl.includes('index.html')) {
          // This request should serve the docs HTML, not the main HTML
          const docsHtmlPath = path.join(__dirname, 'docs', 'index.html');
          return fs.readFileSync(docsHtmlPath, 'utf-8');
        }
        return html;
      },
    },
  };
}

// hack area - fix react-virtualized issue with vite
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
          if (fs.existsSync(onScrollFile)) {
            const code = fs.readFileSync(onScrollFile, "utf-8");
            if (code.includes(WRONG_CODE)) {
              const modified = code.replace(WRONG_CODE, "");
              fs.writeFileSync(onScrollFile, modified);
              console.log(`Fixed react-virtualized in ${onScrollFile}`);
            }
          }
        } catch (e) {
          // Ignore if file doesn't exist or can't be read
        }
      });
    },
  }
}
