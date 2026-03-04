import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import child_process from 'child_process';
import Observable from 'zen-observable';
import taskcluster from '@taskcluster/client';
import { REPO_ROOT } from './repo.js';
import { rimraf } from 'rimraf';

/**
 * Call the Python client's `release.sh`
 *
 * - dir -- directory to publish from
 * - username, password -- for pypi
 * - logfile -- name of the file to write the log to
 * - utils -- taskgraph utils (waitFor, etc.)
 */
export const pyClientRelease = async ({ dir, username, password, logfile, utils }) => {
  // override HOME so this doesn't use the user's credentials
  const homeDir = path.join(REPO_ROOT, 'temp', taskcluster.slugid());

  await mkdirp(homeDir);
  try {
    await utils.waitFor(new Observable(observer => {
      const proc = child_process.spawn('bash', ['./release.sh', '--real'], {
        env: {
          ...process.env,
          HOME: homeDir,
          UV_PUBLISH_USERNAME: username,
          UV_PUBLISH_PASSWORD: password,
          UV_PUBLISH_URL: 'https://upload.pypi.org/legacy/',
        },
        cwd: dir,
      });

      if (logfile) {
        const logStream = fs.createWriteStream(logfile);
        proc.stdout.pipe(logStream, { end: false });
        proc.stderr.pipe(logStream, { end: false });

        let stdoutEnded = false;
        let stderrEnded = false;

        const checkToCloseStream = () => {
          if (stdoutEnded && stderrEnded) {
            logStream.end();
          }
        };

        proc.stdout.on('end', () => {
          stdoutEnded = true;
          checkToCloseStream();
        });

        proc.stderr.on('end', () => {
          stderrEnded = true;
          checkToCloseStream();
        });
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
