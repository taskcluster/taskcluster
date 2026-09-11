import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { throttling } from '@octokit/plugin-throttling';
import { retry } from '@octokit/plugin-retry';
import LRU from 'quick-lru';

const PluggedOctokit = Octokit.plugin(retry, throttling);

// App names become scope segments and must stay expressible in the route params
const APP_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const PRIVATE_KEY_RE = /-----BEGIN RSA PRIVATE KEY-----(\n|\\n).*(\n|\\n)-----END RSA PRIVATE KEY-----(\n|\\n)?/s;
const MAX_THROTTLE_RETRY_SECONDS = 10;
const INSTALLATION_CACHE_MAX_AGE_MS = 60 * 60 * 1000;

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
      id: appName,
      // Retry at most once, so that the handler never blocks for more than
      // MAX_THROTTLE_RETRY_SECONDS, let the request fail instead
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
        return retryCount < 1 && retryAfter < MAX_THROTTLE_RETRY_SECONDS;
      },
      onSecondaryRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(`Secondary rate limit detected for request ${options.method} ${options.url}`);
        return retryCount < 1 && retryAfter < MAX_THROTTLE_RETRY_SECONDS;
      },
    },
    retry: {
      doNotRetry: [400, 401, 403, 404, 410, 422, 429],
    },
  });
};

// https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2026-03-10#exceeding-the-rate-limit
const isRateLimitError = err => {
  if (err.status === 429) {
    return true;
  }

  if (err.status !== 403) {
    return false;
  }

  // Secondary rate limits have no specific header, so the message is the only
  // reliable way to detect them. This is the same thing
  // @octokit/plugin-throttling uses.
  if (/\bsecondary rate\b/i.test(err.message ?? '')) {
    return true;
  }

  const headers = err.response?.headers ?? {};
  return headers['retry-after'] !== undefined || headers['x-ratelimit-remaining'] === '0';
};

// lowercased owner: installation id
export const makeInstallationCache = () => new LRU({ maxSize: 1000, maxAge: INSTALLATION_CACHE_MAX_AGE_MS });

export const makeGithub = ({ cfg, monitor }) => {
  const apps = new Map();

  for (const [name, appCfg] of Object.entries(cfg.githubCredentials?.apps ?? {})) {
    apps.set(name, {
      octokit: buildOctokitApp(name, appCfg, monitor),
      installations: makeInstallationCache(),
    });
  }

  return apps;
};

export const githubBuilder = builder => {
  builder.declare(
    {
      method: 'post',
      route: '/github/:appName/:owner/repo-token',
      params: {
        appName: /^[a-zA-Z0-9_-]+$/,
        owner: /^[A-Za-z0-9._-]+$/,
      },
      name: 'githubRepoToken',
      input: 'github-repo-token-request.yml',
      output: 'github-token-response.yml',
      scopes: {
        AllOf: [
          {
            for: 'repoPerm',
            in: 'repoPerms',
            each: 'auth:github-repo-token:<appName>/<owner>/<repoPerm>',
          },
        ],
      },
      title: 'Get a repository scoped github token',
      stability: 'experimental',
      category: 'Github Credentials',
      description: [
        'Get a Github application installation token scoped to the given repositories',
        'and permissions, using the configured app `appName`.',
        '',
        'Requesting `<permission>: <level>` on `<owner>/<repo>` requires the scope',
        '`auth:github-repo-token:<appName>/<owner>/<repo>:<permission>:<level>`.',
        'Levels and permissions are matched exactly to github token permissions',
        'which can be found at',
        'https://docs.github.com/en/rest/apps/apps?apiVersion=2026-03-10#create-an-installation-access-token-for-an-app.',
        'While token access is widened (requesting a write token will give a read+write one)',
        'scopes are not. Holding `:contents:write` alone only allows requesting a `write` token.',
        'Both owner and repo must be in lowercase in the scope.',
        '',
        'The token expires after an hour but this behavior is github dependent.',
        'You should read the `expires` property from the response if you intend',
        'to maintain active credentials in your task.',
      ].join('\n'),
    },
    async function (req, res) {
      const appName = req.params.appName;
      const owner = req.params.owner.toLowerCase();
      const repositories = req.body.repositories.map(repo => repo.toLowerCase());
      const { permissions } = req.body;
      const repoPerms = [];

      for (const [permission, level] of Object.entries(permissions)) {
        for (const repo of repositories) {
          repoPerms.push(`${repo}:${permission}:${level}`);
        }
      }

      await req.authorize({ appName, owner, repoPerms });

      const app = this.github.get(appName);

      if (app === undefined) {
        return res.reportError('ResourceNotFound', `Application with name \`${appName}\` is not configured`);
      }

      let installationId = app.installations.get(owner);

      if (installationId === undefined) {
        let installationInfo;
        try {
          installationInfo = await getAppInstallationInfo(app.octokit, owner);
        } catch (err) {
          if (err.status === 404) {
            return res.reportError(
              'ResourceNotFound',
              `Application with name \`${appName}\` is not installed on \`${owner}\``
            );
          } else if (isRateLimitError(err)) {
            return res.reportError(
              'TooManyRequests',
              `The application \`${appName}\` is currently hitting rate limits`
            );
          }
          throw err;
        }

        const actualAppOwner = installationInfo.data.account?.login;

        if (actualAppOwner?.toLowerCase() !== owner) {
          return res.reportError(
            'InputError',
            `The application reported a different owner (\`${actualAppOwner}\`) than the requested one. Maybe the owner got renamed?`
          );
        }

        installationId = installationInfo.data.id;
        app.installations.set(owner, installationId);
      }

      let tokenInfo;
      try {
        tokenInfo = await app.octokit.apps.createInstallationAccessToken({
          installation_id: installationId,
          permissions,
          repositories,
        });
      } catch (err) {
        if (err.status === 422) {
          return res.reportError('InputError', 'Github rejected the request: {{message}}', { message: err.message });
        } else if (err.status === 404) {
          app.installations.delete(owner);
          return res.reportError(
            'ResourceNotFound',
            `Application with name \`${appName}\` is not installed on \`${owner}\``
          );
        } else if (isRateLimitError(err)) {
          return res.reportError('TooManyRequests', `The application \`${appName}\` is currently hitting rate limits`);
        }
        throw err;
      }

      return res.reply({ token: tokenInfo.data.token, expires: tokenInfo.data.expires_at });
    }
  );
};

const getAppInstallationInfo = async (octokit, owner) => {
  try {
    return await octokit.apps.getOrgInstallation({ org: owner });
  } catch (err) {
    if (err.status !== 404) {
      throw err;
    }
    return await octokit.apps.getUserInstallation({ username: owner });
  }
};
