export const CHECK_RUN_STATES = {
  QUEUED: 'queued',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};

export const TASK_STATE_TO_CHECK_RUN_STATE = {
  unscheduled: CHECK_RUN_STATES.QUEUED,
  pending: CHECK_RUN_STATES.QUEUED,
  running: CHECK_RUN_STATES.IN_PROGRESS,
  completed: CHECK_RUN_STATES.COMPLETED,
};

export const GITHUB_TASKS_FOR = {
  PUSH: 'github-push',
  RELEASE: 'github-release',
  PULL_REQUEST: 'github-pull-request',
  PULL_REQUEST_UNTRUSTED: 'github-pull-request-untrusted',
};

export const GITHUB_BUILD_STATES = {
  FAILURE: 'failure',
  PENDING: 'pending',
  SUCCESS: 'success',
  CANCELLED: 'cancelled',
};

// https://docs.github.com/developers/webhooks-and-events/webhooks/webhook-events-and-payloads?actionType=released#release
export const GITHUB_RELEASE_ACTION = {
  CREATED: 'created',
  DELETED: 'deleted',
  EDITED: 'edited',
  PRERELEASED: 'prereleased',
  PUBLISHED: 'published',
  RELEASED: 'released',
  UNPUBLISHED: 'unpublished',
};

export const CONCLUSIONS = { // maps status communicated by the queue service to github checkrun conclusions
  'completed': 'success',
  'failed': 'failure',
  'exception': 'failure',
  'deadline-exceeded': 'timed_out',
  'canceled': 'cancelled',
  'claim-expired': 'failure',
  'worker-shutdown': 'neutral', // queue status means: will be retried
  'malformed-payload': 'action_required', // github status means "correct your task definition"
  'resource-unavailable': 'failure',
  'internal-error': 'failure',
  'intermittent-task': 'neutral', // queue status means: will be retried
};

export const EVENT_TYPES = {
  PULL_REQUEST: 'pull_request',
  PUSH: 'push',
  PING: 'ping',
  RELEASE: 'release',
  INSTALLATION: 'installation',
  CHECK_SUITE: 'check_suite',
  CHECK_RUN: 'check_run',
};

export const CHECK_RUN_ACTIONS = {
  CREATED: 'created',
  COMPLETED: 'completed',
  REREQUESTED: 'rerequested',
  REQUESTED_ACTION: 'requested_action',
};

export const PUBLISHERS = {
  PULL_REQUEST: 'pullRequest',
  PUSH: 'push',
  RELEASE: 'release',
  RERUN: 'rerun',
};

export const CHECKLOGS_TEXT = 'View logs in Taskcluster';
export const CHECKRUN_TEXT = 'View task in Taskcluster';
export const LIVE_BACKING_LOG_ARTIFACT_NAME = 'public/logs/live_backing.log';
export const CUSTOM_CHECKRUN_TEXT_ARTIFACT_NAME = 'public/github/customCheckRunText.md';
export const CUSTOM_CHECKRUN_ANNOTATIONS_ARTIFACT_NAME = 'public/github/customCheckRunAnnotations.json';

export default {
  CONCLUSIONS,
  EVENT_TYPES,
  CHECK_RUN_ACTIONS,
  CHECK_RUN_STATES,
  TASK_STATE_TO_CHECK_RUN_STATE,
  PUBLISHERS,
  GITHUB_TASKS_FOR,
  GITHUB_BUILD_STATES,
  GITHUB_RELEASE_ACTION,
  CHECKLOGS_TEXT,
  CHECKRUN_TEXT,
  LIVE_BACKING_LOG_ARTIFACT_NAME,
  CUSTOM_CHECKRUN_TEXT_ARTIFACT_NAME,
  CUSTOM_CHECKRUN_ANNOTATIONS_ARTIFACT_NAME,
};
