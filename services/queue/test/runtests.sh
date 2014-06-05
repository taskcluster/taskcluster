#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)

mocha                               \
  test/validate_test.js             \
  test/queue/tasks_test.js          \
  test/queue/taskstore_test.js      \
  test/api/artifact_urls.js         \
  test/api/claim_timeout.js         \
  test/api/claim.js                 \
  test/api/define_schedule_task.js  \
  test/api/pending_tasks.js         \
  test/api/post_task.js             \
  test/api/rerun_test.js            \
  ;
