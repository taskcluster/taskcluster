module.exports = {
  CONCLUSIONS: { // maps status communicated by the queue service to github checkrun conclusions
    /*eslint quote-props: ["error", "consistent-as-needed"]*/
    'completed': 'success',
    'failed': 'failure',
    'exception': 'failure',
    'deadline-exceeded': 'timed_out',
    'canceled': 'cancelled',
    'superseded': 'neutral', // queue status means: is not relevant anymore
    'claim-expired': 'failure',
    'worker-shutdown': 'neutral', // queue status means: will be retried
    'malformed-payload': 'action_required', // github status means "correct your task definition"
    'resource-unavailable': 'failure',
    'internal-error': 'failure',
    'intermittent-task': 'neutral', // queue status means: will be retried
  },
  CHECKRUN_TEXT: 'View task in Taskcluster',
  CUSTOM_CHECKRUN_TEXT_ARTIFACT_NAME: 'public/github/customCheckRunText.md',
  CUSTOM_CHECKRUN_ANNOTATIONS_ARTIFACT_NAME: 'public/github/customCheckRunAnnotations.json',
};
