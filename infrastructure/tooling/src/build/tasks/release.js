import { Octokit } from '@octokit/rest';
import fs from 'fs';
import util from 'util';
import path from 'path';

import {
  ensureTask,
  npmPublish,
  cargoPublish,
  execCommand,
  pyClientRelease,
  readRepoFile,
  dockerPush,
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

  ensureTask(tasks, {
    title: 'Build Websocktunnel Docker Image',
    requires: [
      'release-version',
      'docker-flow-version',
    ],
    provides: [
      'websocktunnel-docker-image', // image tag
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      utils.step({ title: 'Check Repository' });

      const tag = `taskcluster/websocktunnel:${requirements['release-version']}`;
      const provides = {
        'websocktunnel-docker-image': tag,
      };

      utils.step({ title: 'Building Websocktunnel' });

      const contextDir = path.join(baseDir, 'websocktunnel-build');
      await execCommand({
        command: [
          'go', 'build',
          '-o', path.join(contextDir, 'websocktunnel'),
          './tools/websocktunnel/cmd/websocktunnel',
        ],
        dir: REPO_ROOT,
        logfile: path.join(logsDir, 'websocktunnel-build.log'),
        utils,
        env: { CGO_ENABLED: '0', ...process.env },
      });

      utils.step({ title: 'Building Docker Image' });

      fs.writeFileSync(
        path.join(contextDir, 'version.json'),
        requirements['docker-flow-version']);

      // this simple Dockerfile just packages the binary into a Docker image
      const dockerfile = path.join(contextDir, 'Dockerfile');
      fs.writeFileSync(dockerfile, [
        'FROM scratch',
        'COPY websocktunnel /websocktunnel',
        'COPY version.json /app/version.json',
        'ENTRYPOINT ["/websocktunnel"]',
      ].join('\n'));
      let command = [
        'docker', 'build',
        '--no-cache',
        '--progress', 'plain',
        '--tag', tag,
        contextDir,
      ];
      await execCommand({
        command,
        dir: REPO_ROOT,
        logfile: path.join(logsDir, 'websocktunnel-docker-build.log'),
        utils,
        env: { DOCKER_BUILDKIT: 1, ...process.env },
      });

      if (cmdOptions.staging || !cmdOptions.push) {
        return provides;
      }

      utils.step({ title: 'Pushing Docker Image' });

      const dockerPushOptions = {};
      if (credentials.dockerUsername && credentials.dockerPassword) {
        dockerPushOptions.credentials = {
          username: credentials.dockerUsername,
          password: credentials.dockerPassword,
        };
      }

      await dockerPush({
        logfile: path.join(logsDir, 'websocktunnel-docker-push.log'),
        tag,
        utils,
        baseDir,
        ...dockerPushOptions,
      });

      return provides;
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
    title: `Publish clients/client to npm`,
    requires: [
      'github-release', // to make sure the release finishes first..
    ],
    provides: [
      `publish-clients/client`,
    ],
    run: async (requirements, utils) => {
      if (cmdOptions.staging || !cmdOptions.push) {
        return utils.skip();
      }

      await npmPublish({
        dir: path.join(REPO_ROOT, 'clients/client'),
        apiToken: credentials.npmToken,
        logfile: path.join(logsDir, `publish-clients-client.log`),
        utils });
    },
  });

  ensureTask(tasks, {
    title: `Publish clients/client-web to npm`,
    requires: [
      'github-release', // to make sure the release finishes first..
    ],
    provides: [
      `publish-clients/client-web`,
    ],
    run: async (requirements, utils) => {
      const dir = path.join(REPO_ROOT, 'clients/client-web');

      await execCommand({
        dir,
        command: ['yarn', 'install'],
        utils,
        logfile: path.join(logsDir, `install-clients-client-web.log`),
      });

      if (cmdOptions.staging || !cmdOptions.push) {
        return;
      }

      await npmPublish({
        dir,
        apiToken: credentials.npmToken,
        logfile: path.join(logsDir, `publish-clients-client-web.log`),
        utils });
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
    title: 'Publish to Homebrew and Chocolatey',
    requires: [
      'github-release',
      'release-version',
    ],
    provides: [
      'publish-package-managers',
    ],
    run: async (requirements, utils) => {
      if (cmdOptions.staging || !cmdOptions.push) {
        return utils.skip();
      }

      const version = requirements['release-version'];

      await execCommand({
        dir: REPO_ROOT,
        command: [
          'go', 'tool', 'goreleaser', 'release',
          '--id', 'generic-worker-multiuser',
          '--id', 'start-worker',
          '--id', 'livelog',
          '--id', 'taskcluster-proxy',
          '--clean',
          '--skip=announce',
          '--skip=validate',
        ],
        utils,
        env: {
          ...process.env,
          GH_TOKEN: credentials.ghToken,
          CHOCOLATEY_API_KEY: credentials.chocolateyApiKey,
          GORELEASER_CURRENT_TAG: `v${version}`,
        },
      });

      return {
        'publish-package-managers': 'Published to Homebrew and Chocolatey',
      };
    },
  });

  ensureTask(tasks, {
    title: 'Publish Complete',
    requires: [
      'release-version',
      'monoimage-docker-image',
      'github-release',
      'publish-clients/client',
      'publish-clients/client-web',
      'publish-clients/client-py',
      'publish-clients/client-rust',
      'publish-package-managers',
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
