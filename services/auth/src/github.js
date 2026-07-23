import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { throttling } from '@octokit/plugin-throttling';
import { retry } from '@octokit/plugin-retry';

const PluggedOctokit = Octokit.plugin(retry, throttling);

// App names become scope segments and must stay expressible in the route params
const APP_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const PRIVATE_KEY_RE = /-----BEGIN RSA PRIVATE KEY-----(\n|\\n).*(\n|\\n)-----END RSA PRIVATE KEY-----(\n|\\n)?/s;
const MAX_THROTTLE_RETRY_SECONDS = 10;

const buildOctokitApp = (appName, { appId, privateKey }, monitor) => {
  if (!APP_NAME_RE.test(appName)) {
    throw new Error(`Github app name '${appName}' is not valid. It must match '${APP_NAME_RE}'`);
  }

  if (!appId || !PRIVATE_KEY_RE.test(privateKey ?? '')) {
    throw new Error(`Github app '${appName}' is misconfigured. Make sure it has an 'appId' and a valid 'privateKey'`);
  }

  return new PluggedOctokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey: privateKey.replace(/\\n/g, '\n') },
    log: {
      debug: m => monitor.debug(m),
      info: m => monitor.info(m),
      warn: m => monitor.warning(m),
      error: m => monitor.err(m),
    },
    throttle: {
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);

        // Don't retry if it's going to block the handler for 10+s, let the request fail instead
        return retryCount < 3 && retryAfter < MAX_THROTTLE_RETRY_SECONDS;
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(`Secondary rate limit detected for request ${options.method} ${options.url}`);

        // Don't retry if it's going to block the handler for 10+s, let the request fail instead
        return retryAfter < MAX_THROTTLE_RETRY_SECONDS;
      },
    },
    retry: {
      doNotRetry: [400, 401, 403, 404, 422],
    },
  });
};

export const makeGithub = ({ cfg, monitor }) => {
  const apps = new Map();

  for (const [name, appCfg] of Object.entries(cfg.githubCredentials?.apps ?? {})) {
    apps.set(name, { octokit: buildOctokitApp(name, appCfg, monitor) });
  }

  return apps;
};
