const request = require('superagent');
const util = require('util');

const setTimeoutPromise = util.promisify(setTimeout);

/**
 * Retry a request call with the given URL and method.
 *
 * Responses with status 5xx are retried, and if 5 retries are exceeded then the last
 * response is returned.
 *
 * All other HTTP responses, including 4xx-series responses, are returned (not thrown).
 *
 * All other errors from superagent are thrown.
 */
const throttleRequest = async ({ url, method, response = { status: 0 }, attempt = 1, delay = 100 }) => {
  if (attempt > 5) {
    return response;
  }

  let res;
  try {
    res = await throttleRequest.request(method, url);
  } catch (e) {
    if (e.status >= 400 && e.status < 500) {
      return e;
    }

    if (e.status >= 500) {
      const newDelay = 2 ** attempt * delay;
      return await setTimeoutPromise(newDelay, throttleRequest({
        url,
        method,
        response: e,
        attempt: attempt + 1,
        delay,
      }));
    }

    throw e;
  }
  return res;
};

// for overriding in testing..
throttleRequest.request = request;

const ciSkipRegexp = new RegExp('\\[(skip ci|ci skip)\\]', 'i');

/**
 * Check if push event should be skipped.
 * It can happen when head commit includes one of the keywords in it's message:
 * "[skip ci]" or "[ci skip]"
 *
 * @param {body} object event body
 * @param {body.commits} object[]
 * @param {body.commits[].message} string
 * @param {body.head_commit} object
 * @param {body.head_commit.message} string
 *
 * @returns boolean
 */
const shouldSkipCommit = ({ commits, head_commit = {} }) => {
  let last_commit = head_commit && head_commit.message ? head_commit : false;

  if (!last_commit && Array.isArray(commits) && commits.length > 0) {
    last_commit = commits[commits.length - 1];
  }

  return last_commit && ciSkipRegexp.test(last_commit.message);
};

/**
 * Check if pull_request event should be skipped.
 * It can happen when pull request contains keywords in title or description:
 * "[skip ci]" or "[ci skip]"
 *
 * @param {body} object event body
 * @param {body.pull_request} object[]
 * @param {body.pull_request.title} string
 *
 * @returns boolean
 */
const shouldSkipPullRequest = ({ pull_request }) => {
  return pull_request !== undefined &&
    (ciSkipRegexp.test(pull_request.title) || ciSkipRegexp.test(pull_request.body));
};

/**
 * Removes ANSI control characters from string
 * Source: https://stackoverflow.com/a/18000433
 *
 * @param {string} src
 * @returns string
 */
const ansi2txt = (src) => {
  // eslint-disable-next-line no-control-regex
  const regex = /\x1B\[([0-9]{1,3}(;[0-9]{1,2})?)?[mGK]/gm;
  return src.replace(regex, '');
};

/**
 * Github checks API call is limited to 64kb
 * @param {string} log
 * @param {number} maxLines
 * @param {number} maxPayloadLength
 * @returns string
 */
const tailLog = (log, maxLines = 250, maxPayloadLength = 30000) => {
  return ansi2txt(log).substring(log.length - maxPayloadLength)
    .split('\n')
    .slice(-maxLines)
    .join('\n');
};

const markdownLog = (log) => ['\n---\n\n```bash\n', log, '\n```'].join('');
const markdownAnchor = (name, url) => `[${name}](${url})`;

module.exports = {
  throttleRequest,
  shouldSkipCommit,
  shouldSkipPullRequest,
  ansi2txt,
  tailLog,
  markdownLog,
  markdownAnchor,
};
