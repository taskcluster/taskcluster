import minify from 'yarn-minify';
import { gitLsFiles } from '../utils/index.js';

// Ignore packages while we slowly whittle away the requirements
const IGNORE = {
  'clients/client/yarn.lock': pkg => false,
  'clients/client-web/yarn.lock': pkg => false,
  'yarn.lock': pkg => false,
  'ui/yarn.lock': pkg => [
    'acorn',
    'array-includes',
    'async',
    'bluebird',
    'ccount',
    'chownr',
    'commander',
    'compressible',
    'compression',
    'convert-source-map',
    'csstype',
    'electron-to-chromium',
    'es-abstract',
    'eslint-loader',
    'eslint-module-utils',
    'eslint-plugin-import',
    'eslint-plugin-react',
    'eslint-plugin-react-hooks',
    'es-to-primitive',
    'estraverse',
    'eventemitter3',
    'express',
    'faye-websocket',
    'glob',
    'graceful-fs',
    'history',
    'hoist-non-react-statics',
    'is-callable',
    'is-regex',
    'iterall',
    'json5',
    'jsx-ast-utils',
    'js-yaml',
    'loader-utils',
    'loglevel',
    '@material-ui/utils',
    'mime-db',
    'mkdirp',
    'object.entries',
    'object.fromentries',
    'object-inspect',
    'object.values',
    'on-headers',
    'opn',
    'optionator',
    'parse-entities',
    'p-limit',
    'portfinder',
    'postcss',
    'postcss-value-parser',
    'react-is',
    'readable-stream',
    'regenerate',
    'regenerator-runtime',
    'regexp.prototype.flags',
    'regexpu-core',
    'regjsgen',
    'resolve',
    'rimraf',
    'schema-utils',
    'selfsigned',
    'source-map-support',
    'string.prototype.trimleft',
    'string.prototype.trimright',
    'terser',
    'tslib',
    '@types/node',
    '@types/react',
    'unist-util-visit',
    'url-parse',
    'ws',
  ].includes(pkg),
  'workers/docker-worker/yarn.lock': pkg => [
    'brace-expansion',
    'chownr',
    'end-of-stream',
    'glob',
    'inherits',
    'ipaddr.js',
    'mime-types',
    'minimatch',
    'safe-buffer',
    'which',
  ].includes(pkg),
};

export const getTasks = async () => {
  const tasks = [];

  for (const file of await gitLsFiles()) {
    if (file === 'yarn.lock' || file.endsWith('/yarn.lock')) {
      tasks.push({
        title: `Minify ${file}`,
        provides: [`minify-${file}`],
        run: async (requirements, utils) => {
          minify(file, { ignore: IGNORE[file] });
        },
      });
    }
  }

  return tasks;
};
