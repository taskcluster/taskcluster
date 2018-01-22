import path from 'path';
import taskcluster from 'taskcluster-client';

export default async function(queue, monitor, taskId, runId, job) {
  let res;
  try {
    res = await queue.listArtifacts(taskId, runId);
  } catch (e) {
    monitor.reportError(e, {taskId, runId});
    return job;
  }

  let artifacts = res.artifacts;

  while (res.continuationToken) {
    let continuation = {continuationToken: res.continuationToken};

    try {
      res = await queue.listArtifacts(taskId, runId, continuation);
    } catch (e) {
      monitor.reportError(e, {taskId, runId});
      break;
    }

    artifacts = artifacts.concat(res.artifacts);
  }

  let seen = {};

  let links = artifacts.map((artifact) => {
    let name = path.parse(artifact.name).base;
    if (!seen[name]) {
      seen[name] = [artifact.name];
    } else {
      seen[name].push(artifact.name);
      name = `${name} (${seen[name].length-1})`;
    }
    let link = {
      label: 'artifact uploaded',
      linkText: name,
      url: `https://queue.taskcluster.net/v1/task/${taskId}` +
             `/runs/${runId}/artifacts/${artifact.name}`,
    };
    return link;
  });

  job.jobInfo.links = job.jobInfo.links.concat(links);

  return job;
}
