import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import child_process from 'child_process';
import Observable from 'zen-observable';
import taskcluster from '@taskcluster/client';
import { REPO_ROOT } from './repo.js';
import { rimraf } from 'rimraf';

/**
 * Set up Cargo credentials and call `cargo publish`
 *
 * - dir -- directory to publish from
 * - token -- crates.io token to use (if not set, no auth is set up)
 * - push -- if true, actually publish (otherwise --dry-run)
 * - logfile -- name of the file to write the log to
 * - utils -- taskgraph utils (waitFor, etc.)
 */
export const cargoPublish = async ({ dir, token, push, logfile, utils }) => {
  // override HOME so this doesn't use the user's credentials
  const homeDir = path.join(REPO_ROOT, 'temp', taskcluster.slugid());

  // set up the cargo credentials
  if (token) {
    await mkdirp(path.join(homeDir, '.cargo'));
    await fs.writeFileSync(path.join(homeDir, '.cargo', 'credentials.toml'), `[registry]\ntoken = "${token}"\n`);
  }

  try {
    await utils.waitFor(new Observable(observer => {
      const cmd = ['publish'];
      // the crate has been through CI already, so just publish it as-is (this saves a bunch of time
      // building all of the dependent crates)
      cmd.push('--no-verify');
      if (!push) {
        cmd.push('--dry-run');
      }
      const proc = child_process.spawn('cargo', cmd, {
        env: {
          ...process.env,
          HOME: homeDir,
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
