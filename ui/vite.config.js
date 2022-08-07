import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
      react({
        babel: {
          plugins: [
            ['@babel/plugin-proposal-decorators', { legacy: true }],
            ['@babel/plugin-proposal-class-properties', { loose: false }],
            ['@babel/plugin-proposal-optional-chaining', { loose: true }],
            [
              '@babel/plugin-proposal-nullish-coalescing-operator',
              { loose: true },
            ],
            // ['@babel/plugin-transform-modules-commonjs', { loose: true }],
          ],
        },
      }),
    ],
    esbuild: {
      loader: 'jsx',
      include: /src\/.*\.jsx?$/,
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
          find: '@',
          replacement: SRC_DIR,
        },
      ],
    },
  });
};
