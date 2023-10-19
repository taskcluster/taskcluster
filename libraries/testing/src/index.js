// allow both non-default exports
// import { withDb } from 'taskcluster-lib-testing';

export { default as schemas } from './schemas.js';
export { default as stickyLoader } from './stickyloader.js';
export { default as Secrets } from './secrets.js';
export { default as poll } from './poll.js';
export { default as suiteName } from './suite-name.js';
export { default as withPulse } from './with-pulse.js';
export { default as withMonitor } from './with-monitor.js';

export * from './with-db.js';
export * from './time.js';
export * from './fakeauth.js';

// and default exports
// import testing from 'taskcluster-lib-testing'; testing.withDb();
import * as fakeauth from './fakeauth.js';
import { resetDb, resetTables, withDb } from './with-db.js';
import { runWithFakeTime, sleep } from './time.js';
import schemas from './schemas.js';
import stickyLoader from './stickyloader.js';
import Secrets from './secrets.js';
import poll from './poll.js';
import suiteName from './suite-name.js';
import withPulse from './with-pulse.js';
import withMonitor from './with-monitor.js';

export default {
  schemas,
  stickyLoader,
  Secrets,
  poll,
  suiteName,
  withPulse,
  withMonitor,

  resetDb,
  resetTables,
  withDb,

  runWithFakeTime,
  sleep,

  fakeauth,
};
