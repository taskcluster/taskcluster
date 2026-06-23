import { describe } from 'vitest';

const rootUrl = import.meta.env.TASKCLUSTER_ROOT_URL;

if (!rootUrl) {
  if (import.meta.env.NO_TEST_SKIP) {
    throw new Error('TASKCLUSTER_ROOT_URL not set but NO_TEST_SKIP is set');
  }

  console.log('TASKCLUSTER_ROOT_URL not set');
}

export default {
  rootUrl,
  describe: rootUrl ? describe : describe.skip,
};
