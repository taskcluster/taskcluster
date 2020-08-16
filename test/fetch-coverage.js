/**
 * Download coverage from previous tasks
 */
const taskcluster = require('taskcluster-client');
const fs = require('mz/fs');
const path = require('path');

const COVERAGE_DIR = 'coverage';

const main = async () => {
  let configs;
  if (process.env.TASKCLUSTER_PROXY_URL) {
    configs = {
      rootUrl: process.env.TASKCLUSTER_PROXY_URL,
    };
  } else {
    configs = {
      rootUrl: process.env.TASKCLUSTER_ROOT_URL,
      credentials: {
        clientId: process.env.TASKCLUSTER_CLIENT_ID,
        accessToken: process.env.TASKCLUSTER_ACCESS_TOKEN,
      },
    };
  }
  const queue = new taskcluster.Queue(configs);
  const { dependencies } = await queue.task(process.env.TASK_ID);

  await fs.mkdir(COVERAGE_DIR);
  await Promise.all(dependencies.map(async taskId => {
    try {
      const coverage = await queue.getLatestArtifact(taskId, 'public/coverage-final.json');
      const filename = path.join(COVERAGE_DIR, `${taskId}-coverage.json`);
      console.log(`Writing ${filename}`);
      await fs.writeFile(filename, JSON.stringify(coverage));
    } catch (err) {
      if (err.statusCode !== 404) {
        throw err;
      }
    }
  }));
};

main().catch(console.error);
