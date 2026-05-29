import crypto from 'crypto';
import request from 'superagent';
import util from 'util';

import { ISSUE_COMMENT_ACTIONS } from './constants.js';

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
export const throttleRequest = async ({ url, method, response = { status: 0 }, attempt = 1, delay = 100 }) => {
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

export const ciSkipRegexp = new RegExp('\\[(skip ci|ci skip)\\]', 'i');

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
export const shouldSkipCommit = ({ commits, head_commit = {} }) => {
  let last_commit = head_commit && head_commit.message ? head_commit : false;

  if (!last_commit && Array.isArray(commits) && commits.length > 0) {
    last_commit = commits[commits.length - 1];
  }

  return last_commit && ciSkipRegexp.test(last_commit.message);
};

/**
 * Check if pull_request event should be skipped.
 * It can happen when pull request contains keywords in title:
 * "[skip ci]" or "[ci skip]"
 *
 * @param {body} object event body
 * @param {body.pull_request} object[]
 * @param {body.pull_request.title} string
 *
 * @returns boolean
 */
export const shouldSkipPullRequest = ({ pull_request }) => {
  return pull_request !== undefined && ciSkipRegexp.test(pull_request.title);
};

export const taskclusterCommandRegExp = new RegExp('^\\s*/taskcluster\\s+(.+)$', 'm');

/**
 * Check if comment event should be skipped.
 *
 * We only process comments that:
 *  - have `created` or `edited` action
 *  - issue is open and belongs to a PR
 *  - comment contains keyword `/taskcluster cmd` in the body
 *
 * @param {body} object event body
 * @param {body.action} string
 * @param {body.comment} object
 * @param {body.issue} object
 * @returns boolean
 */
export const shouldSkipComment = ({ action, comment, issue }) => {
  if ([ISSUE_COMMENT_ACTIONS.CREATED, ISSUE_COMMENT_ACTIONS.EDITED].includes(action) === false) {
    return true;
  }

  if (!issue || !issue.pull_request || issue.state !== 'open') {
    return true;
  }

  if (!comment || !comment.body || !taskclusterCommandRegExp.test(comment.body)) {
    return true;
  }

  return false;
};

/**
 * Extract taskcluster command from the comment body
 *
 * Command is anything after `/taskcluster` keyword and before the next whitespace
 *
 * @param {comment} object
 * @param {comment.body} string
 * @returns string
 * @throws {Error} if no command is found
 */
export const getTaskclusterCommand = (comment) => {
  const match = taskclusterCommandRegExp.exec(comment.body);
  if (!match) {
    throw new Error('No taskcluster command found');
  }
  return match[1].trim();
};

/**
 * Removes ANSI control characters from string
 * Source: https://github.com/chalk/ansi-regex/blob/main/index.js
 * The reason why we don't use ansi-regex package is because it's "modules" only,
 * and taskcluster doesn't yet support it.
 *
 * See https://en.wikipedia.org/wiki/ANSI_escape_code
 *
 * @param {string} src
 * @returns string
 */
export const ansi2txt = (src) => {
  // eslint-disable-next-line no-control-regex
  const pattern = [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))',
  ].join('|');
  const regex = new RegExp(pattern, 'gm');
  return src.replace(regex, '');
};

/**
 * Github checks API call is limited to 64kb.
 *
 * Streams a log from an async iterable (e.g. a fetch response body),
 * extracting the first headLines and last tailLines with bounded memory.
 * Uses a head buffer and a tail buffer that evicts old entries, so memory
 * usage is O(headLines + tailLines) regardless of log size.
 *
 * @param {AsyncIterable} stream - async iterable yielding byte chunks
 * @param {number} headLines - number of lines to keep from the start
 * @param {number} tailLines - number of lines to keep from the end
 * @param {number} maxPayloadLength - maximum output length in bytes
 * @returns {Promise<string>} formatted log extract
 */
export const extractLog = async (stream, headLines = 20, tailLines = 200, maxPayloadLength = 30000) => {
  const LOG_BUFFER = 42;
  const decoder = new TextDecoder('utf-8', { stream: true });
  const head = [];
  const tail = [];
  let totalLines = 0;
  let headFull = false;
  let leftover = '';

  for await (const chunk of stream) {
    const text = leftover + decoder.decode(chunk, { stream: true });
    const lines = text.split('\n');
    leftover = lines.pop();

    for (const line of lines) {
      const clean = ansi2txt(line);
      totalLines++;
      if (!headFull) {
        head.push(clean);
        if (head.length >= headLines) {
          headFull = true;
        }
      } else {
        tail.push(clean);
        if (tail.length > tailLines) {
          tail.shift();
        }
      }
    }
  }

  // Flush any remaining bytes from the decoder
  const finalText = leftover + decoder.decode();
  if (finalText) {
    const clean = ansi2txt(finalText);
    totalLines++;
    if (!headFull) {
      head.push(clean);
    } else {
      tail.push(clean);
      if (tail.length > tailLines) {
        tail.shift();
      }
    }
  }

  const headLog = head.join('\n');
  const tailLog = tail.join('\n');
  const fullLog = tailLog ? headLog + '\n' + tailLog : headLog;

  // Small log: return full content if it fits
  if (totalLines <= headLines + tailLines && fullLog.length <= maxPayloadLength) {
    return fullLog;
  }

  // If head alone exceeds the payload budget, truncate at a line boundary
  if (maxPayloadLength <= headLog.length) {
    const truncated = headLog.slice(0, maxPayloadLength);
    const lastNewLine = truncated.lastIndexOf('\n');
    return lastNewLine > 0 ? truncated.substring(0, lastNewLine) : truncated;
  }

  // Budget remaining for the tail after head + separator
  const tailBudget = maxPayloadLength - headLog.length - LOG_BUFFER;

  if (tailBudget <= 0 || !tailLog) {
    return `${headLog}\n\n...(${totalLines - head.length} lines hidden)...\n\n`;
  }

  // Trim tail to fit the byte budget
  let finalTail = tailLog;
  if (finalTail.length > tailBudget) {
    finalTail = finalTail.slice(-tailBudget);
    const newLinePos = finalTail.indexOf('\n');
    if (newLinePos >= 0) {
      finalTail = finalTail.slice(newLinePos + 1);
    }
  }

  const availableTailLines = finalTail.split('\n').length;
  const finalHiddenLines = totalLines - head.length - availableTailLines;

  return `${headLog}\n\n...(${finalHiddenLines} lines hidden)...\n\n${finalTail}`;
};

export const markdownLog = (log) => ['\n---\n\n```bash\n', log, '\n```'].join('');
export const markdownAnchor = (name, url) => `[${name}](${url})`;

/**
 * Hashes a payload by some secret, using the same algorithm that
 * GitHub uses to compute their X-Hub-Signature HTTP header. Used
 * for verifying the legitimacy of WebHooks.
 **/
export function generateXHubSignature(secret, payload, algorithm = 'sha1') {
  if (!['sha1', 'sha256'].includes(algorithm)) {
    throw new Error('Invalid algorithm');
  }
  return [
    algorithm,
    crypto.createHmac(algorithm, secret).update(payload).digest('hex'),
  ].join('=');
}

/**
 * Compare hmac.digest() signatures in constant time
 * Double hmac verification is the preferred way to do this
 * since we can't predict optimizations performed by the runtime.
 **/
export function compareSignatures(sOne, sTwo) {
  const secret = crypto.randomBytes(16).toString('hex');
  const h1 = crypto.createHmac('sha1', secret).update(sOne);
  const h2 = crypto.createHmac('sha1', secret).update(sTwo);
  return crypto.timingSafeEqual(h1.digest(), h2.digest());
}

/**
 * signature must be one of the: 'sha256=xxx', 'sha1=xxx'
 */
export const checkGithubSignature = (secret, payload, signature) => {
  const [algorithm] = signature.split('=');
  const expected = generateXHubSignature(secret, payload, algorithm);
  return compareSignatures(signature, expected);
};

export default {
  throttleRequest,
  shouldSkipCommit,
  shouldSkipPullRequest,
  ansi2txt,
  extractLog,
  markdownLog,
  markdownAnchor,
  checkGithubSignature,
  generateXHubSignature,
};
