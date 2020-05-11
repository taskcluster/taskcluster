/**
 * Generate DockerFlow version.json contents, given the results of gitDescribe
 */
exports.dockerFlowVersion = ({gitDescription, revision}) => JSON.stringify({
  version: gitDescription.slice(1),
  commit: revision,
  source: 'https://github.com/taskcluster/taskcluster',
  // https://github.com/mozilla-services/Dockerflow/blob/master/docs/version_object.md specifies a "build" link
  // pointing to a "CI Job".  It turns out that for Taskcluster this "CI Job" should be a link to a raw log. So
  // in the case that TASK_ID is set (so we are running in CI), we can set that to point to what we expect will
  // be a link to this task.
  build: process.env.TASK_ID ?
    `${process.env.TASKCLUSTER_ROOT_URL}/${process.env.TASK_ID}/${process.env.RUN_ID}/public/logs/live.log` :
    'NONE',
});
