/**
 * Generate DockerFlow version.json contents, given the results of gitDescribe
 */
exports.dockerFlowVersion = ({gitDescription, revision}) => JSON.stringify({
  version: gitDescription.slice(1),
  commit: revision,
  source: 'https://github.com/taskcluster/taskcluster',
  // https://github.com/mozilla-services/Dockerflow/blob/master/docs/version_object.md specifies a "build" link
  // pointing to a "CI Job".  Reference for what that means is basically
  // https://github.com/mozilla-services/cloudops-infra-deploylib/blob/1bf6de7f5270ec9f3482cd0a70915532e05d5fe7/deploylib/docker.py#L179-L204
  // so this tries to reverse-engineer that code to get it to find a file with a matching value
  build: process.env.TASK_ID ?
    `${process.env.TASKCLUSTER_ROOT_URL}/tasks/${process.env.TASK_ID}` :
    'NONE',
});
