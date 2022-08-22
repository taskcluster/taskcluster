const { dirname } = require('path');
const fs = require('fs');

const ENV_VARS = [
  {name: 'APPLICATION_NAME', defaultValue: 'Taskcluster', json: false},
  {name: 'TASKCLUSTER_ROOT_URL', defaultValue: 'https://tc.example.com', json: false},
  {name: 'GRAPHQL_ENDPOINT', defaultValue: '/graphql', json: false},
  {name: 'GRAPHQL_SUBSCRIPTION_ENDPOINT', defaultValue: '/subscription', json: false},
  {name: 'DOCS_ONLY', defaultValue: false, json: false},
  {name: 'UI_LOGIN_STRATEGY_NAMES', defaultValue: '', json: false},
  {name: 'GA_TRACKING_ID', defaultValue: '', json: false},
  {name: 'SENTRY_DSN', defaultValue: '', json: false},
  {name: 'BANNER_MESSAGE', defaultValue: '', json: false},
  {name: 'SITE_SPECIFIC', defaultValue: {}, json: true},
];

/**
 * Generate `env.js` in the static directory based on the current
 * environment variables.
 */
const generateEnvJs = filename => {
  const env = {};
  for (const {name, defaultValue, json} of ENV_VARS) {
    if (process.env[name]) {
      env[name] = json ? JSON.parse(process.env[name]) : process.env[name];
    } else {
      env[name] = defaultValue;
    }
  }
  const envJs = `window.env = ${JSON.stringify(env, null, 2)}`;

  const dir = dirname(filename);
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }

  if (!fs.existsSync(filename)){
    fs.writeFileSync(filename, envJs, 'utf8');
  }
  console.log('file written', filename, fs.readFileSync(filename));
};

module.exports = generateEnvJs;

if (require.main === module) {
  generateEnvJs(process.argv[2]);
}
