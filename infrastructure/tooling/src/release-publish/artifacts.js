import fs from 'node:fs';
import path from 'node:path';
import taskcluster from '@taskcluster/client';

const defaultDownload = async ({ queue, taskId, name, file }) => {
  await taskcluster.downloadManagedArtifact({
    taskId,
    name,
    queue,
    streamFactory: () => fs.createWriteStream(file),
  });
};

/**
 * Download every artifact under `prefix` from each of this task's dependencies into destDir.
 * Release tasks use this instead of fetches, because `bare` tasks (src/job.py) don't use run-task.
 */
export const fetchDependencyArtifacts = async ({ queue, taskId, prefix, destDir, download = defaultDownload }) => {
  const { dependencies } = await queue.task(taskId);
  const result = [];
  const seen = new Map();
  for (const depId of dependencies) {
    let continuationToken;
    do {
      const page = await queue.listLatestArtifacts(depId, continuationToken ? { continuationToken } : {});
      for (const { name } of page.artifacts) {
        if (!name.startsWith(prefix)) {
          continue;
        }
        const fileName = name.slice(prefix.length);
        if (!fileName || fileName === '.' || fileName === '..' || fileName !== path.basename(fileName)) {
          throw new Error(
            `refusing artifact ${JSON.stringify(name)}: ${JSON.stringify(fileName)} is not a plain file name`
          );
        }
        const file = path.join(destDir, fileName);
        if (!path.resolve(destDir, fileName).startsWith(path.resolve(destDir) + path.sep)) {
          throw new Error(`refusing artifact ${JSON.stringify(name)}: destination escapes ${destDir}`);
        }
        if (seen.has(fileName)) {
          throw new Error(`artifact ${fileName} is produced by both ${seen.get(fileName)} and ${depId}`);
        }
        seen.set(fileName, depId);
        await download({ queue, taskId: depId, name, file });
        result.push({ taskId: depId, name, file: fileName, size: fs.statSync(file).size });
      }
      continuationToken = page.continuationToken;
    } while (continuationToken);
  }
  return result;
};
