import { Octokit } from '@octokit/rest';
import fs from 'fs';
import util from 'util';
import path from 'path';

import {
  ensureTask,
  cargoPublish,
  execCommand,
  pyClientRelease,
  readRepoFile,
  REPO_ROOT,
} from '../../utils/index.js';

const readFile = util.promisify(fs.readFile);

export default ({ tasks, cmdOptions, credentials, baseDir, logsDir }) => {
  ensureTask(tasks, {
    title: 'Get ChangeLog',
    requires: ['release-version'],
    provides: [
      'changelog-text',
    ],
    run: async (requirements, utils) => {
      if (cmdOptions.staging) {
        return {
          'changelog-text': '(staging release)',
        };
      }

      // recover the changelog for this version from CHANGELOG.md, where `yarn
      // release` put it
      const changelogFile = await readRepoFile('CHANGELOG.md');
      const version = requirements['release-version'];
      const regex = new RegExp(`^## v${version}\n+(.*?)\n^## v`, 'sm');
      const match = changelogFile.match(regex);
      if (!match) {
        throw new Error(`Could not find version ${version} in CHANGELOG.md`);
      }
      return {
        'changelog-text': match[1],
      };
    },
  });

  /* -- monoimage docker image build occurs here -- */

  ensureTask(tasks, {
    title: 'Create GitHub Release',
    requires: [
      'clean-artifacts-dir',
      'release-version',
      'client-shell-artifacts',
      'generic-worker-artifacts',
      'worker-runner-artifacts',
      'taskcluster-proxy-artifacts',
      'changelog-text',
      'monoimage-push',
      'monoimage-devel-push',
      'websocktunnel-docker-image',
      'livelog-docker-image',
      'taskcluster-proxy-docker-image',
      'generic-worker-image',
      'livelog-artifacts',
      'npm-client-artifact',
      'npm-client-web-artifact',
    ],
    provides: [
      'github-release',
    ],
    run: async (requirements, utils) => {
      const octokit = new Octokit({ auth: `token ${credentials.ghToken}` });
      const artifactsDir = requirements['clean-artifacts-dir'];

      utils.status({ message: `Create Release` });
      const release = await octokit.repos.createRelease({
        owner: 'taskcluster',
        repo: cmdOptions.staging ? 'staging-releases' : 'taskcluster',
        tag_name: `v${requirements['release-version']}`,
        name: `v${requirements['release-version']}`,
        body: await requirements['changelog-text'],
        draft: cmdOptions.staging ? true : false,
        prerelease: false,
      });
      const { upload_url } = release.data;

      const files = requirements['client-shell-artifacts']
        .concat(requirements['generic-worker-artifacts'])
        .concat(requirements['worker-runner-artifacts'])
        .concat(requirements['livelog-artifacts'])
        .concat(requirements['taskcluster-proxy-artifacts'])
        .concat([requirements['npm-client-artifact']])
        .concat([requirements['npm-client-web-artifact']])
        .map(name => ({ name, contentType: 'application/octet-stream' }));
      for (let { name, contentType } of files) {
        utils.status({ message: `Upload Release asset ${name}` });
        const data = await readFile(path.join(artifactsDir, name));

        /* Artifact uploads to GitHub seem to fail.. a lot.  So we retry each
         * one a few times with some delay, in hopes of getting lucky.  */
        let retries = 5;
        while (retries-- > 0) {
          try {
            await octokit.repos.uploadReleaseAsset({
              url: upload_url,
              headers: {
                'content-length': data.length,
                'content-type': contentType,
              },
              name,
              data,
            });
          } catch (err) {
            if (!retries) {
              throw err;
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
            utils.status({ message: `Upload release asset ${name} - retrying after error` });
            continue;
          }
          break;
        }
      }

      return {
        'github-release': release.data.html_url,
      };
    },
  });

  ensureTask(tasks, {
    title: `Pack clients/client for npm`,
    requires: [
      'clean-artifacts-dir',
    ],
    provides: [
      'npm-client-artifact',
    ],
    run: async (requirements, utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];
      const dir = path.join(REPO_ROOT, 'clients/client');

      const output = await execCommand({
        dir,
        command: ['npm', 'pack'],
        utils,
        keepAllOutput: true,
        logfile: path.join(logsDir, 'pack-clients-client.log'),
      });

      // npm pack prints the tarball filename on the last line of stdout
      const tarball = output.trim().split('\n').pop();
      const tarballPath = path.join(dir, tarball);
      fs.copyFileSync(tarballPath, path.join(artifactsDir, tarball));
      fs.unlinkSync(tarballPath);

      return {
        'npm-client-artifact': tarball,
      };
    },
  });

  ensureTask(tasks, {
    title: `Pack clients/client-web for npm`,
    requires: [
      'clean-artifacts-dir',
    ],
    provides: [
      'npm-client-web-artifact',
    ],
    run: async (requirements, utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];
      const dir = path.join(REPO_ROOT, 'clients/client-web');

      await execCommand({
        dir,
        command: ['yarn', 'install'],
        utils,
        logfile: path.join(logsDir, 'install-clients-client-web.log'),
      });

      const output = await execCommand({
        dir,
        command: ['npm', 'pack'],
        utils,
        keepAllOutput: true,
        logfile: path.join(logsDir, 'pack-clients-client-web.log'),
      });

      // npm pack prints the tarball filename on the last line of stdout
      const tarball = output.trim().split('\n').pop();
      const tarballPath = path.join(dir, tarball);
      fs.copyFileSync(tarballPath, path.join(artifactsDir, tarball));
      fs.unlinkSync(tarballPath);

      return {
        'npm-client-web-artifact': tarball,
      };
    },
  });

  ensureTask(tasks, {
    title: `Publish clients/client-py to pypi`,
    requires: [
      'github-release', // to make sure the release finishes first..
    ],
    provides: [
      `publish-clients/client-py`,
    ],
    run: async (requirements, utils) => {
      if (cmdOptions.staging || !cmdOptions.push) {
        return utils.skip();
      }

      await pyClientRelease({
        dir: path.join(REPO_ROOT, 'clients', 'client-py'),
        username: credentials.pypiUsername,
        password: credentials.pypiPassword,
        logfile: path.join(logsDir, 'publish-client-py.log'),
        utils });
    },
  });

  ensureTask(tasks, {
    title: `Publish clients/client-rust to crates.io`,
    requires: [
      'github-release', // to make sure the release finishes first..
    ],
    provides: [
      `publish-clients/client-rust`,
    ],
    run: async (requirements, utils) => {
      // upload each of the individual crates, in dependency order; note that
      // integration-tests does not get published!
      for (const dir of ['client', 'download', 'upload']) {
        await cargoPublish({
          dir: path.join(REPO_ROOT, 'clients', 'client-rust', dir),
          token: credentials.cratesioToken,
          push: cmdOptions.push && !cmdOptions.staging,
          logfile: path.join(logsDir, `publish-client-${dir}-rust.log`),
          utils });
      }
    },
  });

  ensureTask(tasks, {
    title: 'Publish Complete',
    requires: [
      'release-version',
      'monoimage-docker-image',
      'github-release',
      'publish-clients/client-py',
      'publish-clients/client-rust',
    ],
    provides: [
      'target-publish',
    ],
    run: async (requirements, utils) => {
      return {
        'target-publish': [
          `Release version: ${requirements['release-version']}`,
          `Release docker image: ${requirements['monoimage-docker-image']}`,
          `GitHub release: ${requirements['github-release']}`,
        ].join('\n'),
      };
    },
  });
};
