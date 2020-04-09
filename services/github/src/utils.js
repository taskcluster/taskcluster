const request = require('superagent');
const util = require('util');

const setTimeoutPromise = util.promisify(setTimeout);

const throttleRequest = async ({url, method, delay = 10, response = {status: 0}, attempt = 1}) => {
  if (attempt > 5) {
    return response;
  }

  let res;
  try {
    res = await request(method, url);
  } catch (e) {
    if (e.status >= 400 && e.status < 500) {
      return e;
    }
    if (e.status >= 500) {
      const newDelay = 2 ** attempt * 100;
      return await setTimeoutPromise(newDelay, throttleRequest({
        url,
        method,
        delay: newDelay,
        response: e,
        attempt: attempt + 1,
      }));
    }
  }
  return res;
};

const generateQueueClientScopes = ({tasks_for, push, reportingRoute, schedulerId}) => {
  let scopes = [];

  switch (tasks_for) {
    case 'github-pull-request':
      scopes = [`assume:repo:github.com/${ payload.organization }/${ payload.repository }:pull-request`];
      break;
    case 'github-push':
      if (push) {
        scopes = [`assume:repo:github.com/${ payload.organization }/${ payload.repository }:${push.type}:${push.ref}`]
      } else {
        scopes = [];
      }
      break;
    case 'github-release':
      scopes = [`assume:repo:github.com/${ payload.organization }/${ payload.repository }:release`];
      break;
    default:
      scopes = [];
  }

  scopes.push(`queue:route:${reportingRoute}`);
  scopes.push(`queue:scheduler-id:${schedulerId}`);

  return scopes;
};

module.exports = {
  throttleRequest,
  generateQueueClientScopes,
};
