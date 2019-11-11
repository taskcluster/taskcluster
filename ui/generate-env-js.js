const { dirname } = require('path');
const fs = require('fs');

const ENV_DEFAULTS = {
  APPLICATION_NAME: 'Taskcluster',
  TASKCLUSTER_ROOT_URL: 'https://tc.example.com',
  GRAPHQL_ENDPOINT: '/graphql',
  GRAPHQL_SUBSCRIPTION_ENDPOINT: '/subscription',
  DOCS_ONLY: false,
  UI_LOGIN_STRATEGY_NAMES: '',
  GA_TRACKING_ID: '',
  SENTRY_DSN: '',
  BANNER_MESSAGE: '',
};

/**
 * Generate `env.js` in the static directory based on the current
 * environment variables.
 */
const generateEnvJs = filename => {
  const envJs = `window.env = ${
    JSON.stringify(
      Object.keys(ENV_DEFAULTS).reduce((acc, curr) => {
        acc[curr] = process.env[curr] || ENV_DEFAULTS[curr];

        return acc;
      }, {}), null, 2)
  };`;

  const dir = dirname(filename);
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }

  if (!fs.existsSync(filename)){
    fs.writeFileSync(filename, envJs, 'utf8');
  }
};

module.exports = generateEnvJs

if (require.main === module) {
  generateEnvJs(process.argv[2]);
}
