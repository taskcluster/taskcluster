module.exports = {
  CONCLUSIONS: { // maps status communicated by the queue service to github checkrun conclusions
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
  },
  EVENT_TYPES: {
    PULL_REQUEST: 'pull_request',
    PUSH: 'push',
    PING: 'ping',
    RELEASE: 'release',
    INSTALLATION: 'installation',
    CHECK_SUITE: 'check_suite',
    CHECK_RUN: 'check_run',
  },
  CHECK_RUN_ACTIONS: {
    CREATED: 'created',
    COMPLETED: 'completed',
    REREQUESTED: 'rerequested',
    REQUESTED_ACTION: 'requested_action',
  },
  PUBLISHERS: {
    PULL_REQUEST: 'pullRequest',
    PUSH: 'push',
    RELEASE: 'release',
    RERUN: 'rerun',
  },
  CHECKLOGS_TEXT: 'View logs in Taskcluster',
  CHECKRUN_TEXT: 'View task in Taskcluster',
  CUSTOM_CHECKRUN_TEXT_ARTIFACT_NAME: 'public/github/customCheckRunText.md',
  CUSTOM_CHECKRUN_ANNOTATIONS_ARTIFACT_NAME: 'public/github/customCheckRunAnnotations.json',
};
