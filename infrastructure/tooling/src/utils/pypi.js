const fs = require('fs');
const util = require('util');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const child_process = require('child_process');
const Observable = require('zen-observable');
const taskcluster = require('taskcluster-client');
const {REPO_ROOT} = require('./repo');

/**
 * Call the Python client's `release.sh`
 *
 * - dir -- directory to publish from
 * - username, password -- for pypi
 * - logfile -- name of the file to write the log to
 * - utils -- taskgraph utils (waitFor, etc.)
 */
exports.pyClientRelease = async ({dir, username, password, logfile, utils}) => {
  // override HOME so this doesn't use the user's credentials
  const homeDir = path.join(REPO_ROOT, 'temp', taskcluster.slugid());

  await mkdirp(homeDir);
  try {
    await utils.waitFor(new Observable(observer => {
      const proc = child_process.spawn('bash', ['./release.sh', '--real'], {
        env: {
          ...process.env,
          HOME: homeDir,
          TWINE_USERNAME: username,
          TWINE_PASSWORD: password,
          TWINE_REPOSITORY_URL: 'https://upload.pypi.org/legacy/',
          TWINE_NON_INTERACTIVE: '1',
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
          observer.error(new Error(`release.sh exited with code ${code}; see ${logfile} for details`));
        } else {
          observer.complete();
        }
      });
    }));
  } finally {
    await rimraf(homeDir);
  }
};
