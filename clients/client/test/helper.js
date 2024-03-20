import errorStackParser from 'error-stack-parser';
import path from 'path';

// Restore TASKCLUSTER_* env vars after this test suite runs, to the values they
// had when it began.
export const withRestoredEnvVars = () => {
  const vars = ['TASKCLUSTER_CLIENT_ID', 'TASKCLUSTER_ROOT_URL', 'TASKCLUSTER_ACCESS_TOKEN'];

  let values;
  suiteSetup('save TASKCLUSTER_* env vars', function() {
    values = {};
    for (let v of vars) {
      if (process.env[v]) {
        values[v] = process.env[v];
      }
    }
  });

  suiteTeardown('restore TASKCLUSTER_* env vars', function() {
    for (let v of vars) {
      if (values[v]) {
        process.env[v] = values[v];
      } else {
        delete process.env[v];
      }
    }
  });
};

const ROOT_DIR = new URL('../../..', import.meta.url).pathname;
export const suiteName = () => {
  const o = {}; Error.captureStackTrace(o, suiteName);
  const stack = errorStackParser.parse(o);
  return path.relative(ROOT_DIR, stack[0].fileName);
};

export const sleep = function (delay) {
  return new Promise(function (accept) {
    setTimeout(accept, delay);
  });
};

export default {
  withRestoredEnvVars,
  suiteName,
  sleep,
};
