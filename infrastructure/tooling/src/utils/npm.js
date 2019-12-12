const util = require('util');
const fs = require('fs');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const child_process = require('child_process');
const Observable = require('zen-observable');
const taskcluster = require('taskcluster-client');
const {REPO_ROOT} = require('./repo');

/**
 * Perform an `npm publish`
 *
 * - dir -- directory to publish from
 * - apiToken -- npm API token
 * - logfile -- name of the file to write the log to
 * - utils -- taskgraph utils (waitFor, etc.)
 */
exports.npmPublish = async ({dir, apiToken, logfile, utils}) => {
  // override HOME so this doesn't use the user's npm token
  const homeDir = path.join(REPO_ROOT, 'temp', taskcluster.slugid());

  await mkdirp(homeDir);
  try {
    await utils.waitFor(new Observable(observer => {
      const proc = child_process.spawn('npm', ['publish'], {
        env: {
          ...process.env,
          HOME: homeDir,
          NPM_TOKEN: apiToken,
        },
        cwd: dir,
      });

      if (logfile) {
        const logStream = fs.createWriteStream(logfile);
        proc.stdout.pipe(logStream);
        proc.stderr.pipe(logStream);
      }

      const loglines = data =>
        data.toString('utf-8').trimRight().split(/[\r\n]+/).forEach(l => observer.next(l));
      proc.stdout.on('data', loglines);
      proc.stderr.on('data', loglines);
      proc.on('close', code => {
        if (code !== 0) {
          observer.error(new Error(`npm exited with code ${code}; check ${logfile} for details`));
        } else {
          observer.complete();
        }
      });
    }));
  } finally {
    await rimraf(homeDir);
  }
};
