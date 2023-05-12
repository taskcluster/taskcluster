import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// import react from "@vitejs/plugin-react-swc";
// import mdx from '@mdx-js/rollup'
import Markdown from "vite-plugin-react-markdown";
import viteTsconfigPaths from 'vite-tsconfig-paths';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import { getBabelOutputPlugin } from '@rollup/plugin-babel'
import gql from 'vite-plugin-simple-gql';
import generateEnvJs from './generate-env-js';

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
export default ({ mode }) => {
  if (mode === 'development') {
    generateEnvJs(path.join(STATIC_DIR, 'env.js'));
  }

  return defineConfig({
    plugins: [
      gql(),
      viteTsconfigPaths(),
      Markdown(),

      // https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react
      // react({
      //   include: [/\.(md|mdx|js|jsx|ts|tsx)$/],
      // }),
      //   tsDecorators: true,
      //   // babel: {
      //   //   plugins: [
      //   //     ['@babel/plugin-proposal-decorators', { loose: true, decoratorsBeforeExport: true }],
      //   //     ['@babel/plugin-proposal-class-properties', { loose: false }],
      //   //     ['@babel/plugin-proposal-optional-chaining', { loose: true }],
      //   //     [
      //   //       '@babel/plugin-proposal-nullish-coalescing-operator',
      //   //       { loose: true },
      //   //     ],
      //   //     ['@babel/plugin-transform-modules-commonjs', { loose: true }],
      //   //   ],
      //   // },
      // }),
    ],
    esbuild: {
      loader: 'tsx',
      include: /src\/.*\.(jsx|mdx)?$/,
      exclude: [],
    },
    server: {
      port,
      proxy: serverProxyConfig,
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
        // {
        //   find: '@',
        //   replacement: SRC_DIR,
        // },
      ],
    },
    build: {
      rollupOptions: {
        input: {
          main: path.join(__dirname, 'index.html'),
          docs: path.join(__dirname, 'docs/index.html'),
        },
        output: {
          preserveModules: false,
          plugins: [
            // mdx({})
          ],
        },
        // output: {
        //   plugins: [
        //     getBabelOutputPlugin({
        //       allowAllFormats: true,
        //       presets: [
        //         [
        //           '@babel/preset-env',
        //         ],
        //       ],
        //     }),
        //   ],
        // },
      },
    },
    optimizeDeps: {
      exclude: ['build/*', 'dist/*'],
      entries: ['index.html', 'docs/index.html'],
      esbuildOptions: {
        // Node.js global to browser globalThis
        define: {
          global: 'globalThis',
        },
        // Enable esbuild polyfill plugins
        plugins: [
          NodeGlobalsPolyfillPlugin({
            buffer: true,
          }),
        ],
        loader: {
          '.jsx': 'tsx',
          // '.mdx': 'tsx',
        },
      },
    },
  });
};
