const Octokit = require('@octokit/rest');
const fs = require('fs');
const glob = require('glob');
const util = require('util');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const {
  ensureTask,
  gitDescribe,
  npmPublish,
  execCommand,
  pyClientRelease,
  readRepoFile,
  readRepoJSON,
  dockerRun,
  dockerPull,
  dockerPush,
  dockerFlowVersion,
  REPO_ROOT,
} = require('../utils');

const readFile = util.promisify(fs.readFile);

module.exports = ({tasks, cmdOptions, credentials, baseDir, logsDir}) => {
  const artifactsDir = path.join(baseDir, 'release-artifacts');

  ensureTask(tasks, {
    title: 'Get release version',
    requires: [],
    provides: ['release-version', 'docker-flow-version'],
    run: async (requirements, utils) => {
      if (cmdOptions.staging) {
        // for staging releases, we get the version from the staging-release/*
        // branch name, and use a fake revision
        const match = /staging-release\/v(\d+\.\d+\.\d+)$/.exec(cmdOptions.staging);
        if (!match) {
          throw new Error(`Staging releases must have branches named 'staging-release/vX.Y.Z'; got ${cmdOptions.staging}`);
        }
        const version = match[1];

        return {
          'release-version': version,
          'docker-flow-version': dockerFlowVersion({
            gitDescription: `v${version}`,
            revision: '9999999999999999999999999999999999999999',
          }),
        };
      }

      const {gitDescription, revision} = await gitDescribe({
        dir: REPO_ROOT,
        utils,
      });

      if (!gitDescription.match(/^v\d+\.\d+\.\d+$/)) {
        throw new Error(`Can only publish releases from git revisions with tags of the form vX.Y.Z, not ${gitDescription}`);
      }

      return {
        'release-version': gitDescription.slice(1),
        'docker-flow-version': dockerFlowVersion({gitDescription, revision}),
      };
    },
  });

  ensureTask(tasks, {
    title: 'Get ChangeLog',
    requires: ['release-version'],
    provides: [
      'changelog-text',
      'build-can-start', // wait to build until we're sure this worked..
    ],
    run: async (requirements, utils) => {
      if (cmdOptions.staging) {
        return {
          'changelog-text': '(staging release)',
          'build-can-start': true,
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
        'build-can-start': true,
      };
    },
  });

  ensureTask(tasks, {
    title: 'Clean release-artifacts',
    requires: [],
    provides: ['cleaned-release-artifacts'],
    run: async (requirements, utils) => {
      await rimraf(artifactsDir);
      await mkdirp(artifactsDir);
    },
  });

  ensureTask(tasks, {
    title: 'Build client-shell artifacts',
    requires: ['cleaned-release-artifacts'],
    provides: ['client-shell-artifacts'],
    run: async (requirements, utils) => {
      await execCommand({
        dir: artifactsDir,
        command: ['go', 'get', '-u', 'github.com/mitchellh/gox'],
        utils,
      });

      const osarch = 'linux/amd64 darwin/amd64';
      await execCommand({
        dir: path.join(REPO_ROOT, 'clients', 'client-shell'),
        command: [
          'gox',
          `-osarch=${osarch}`,
          `-output=${artifactsDir}/taskcluster-{{.OS}}-{{.Arch}}`,
        ],
        utils,
      });

      const artifacts = osarch.split(' ')
        .map(osarch => {
          const [os, arch] = osarch.split('/');
          return `taskcluster-${os}-${arch}`;
        });

      return {
        'client-shell-artifacts': artifacts,
      };
    },
  });

  ensureTask(tasks, {
    title: 'Build docker-worker artifacts',
    requires: ['cleaned-release-artifacts'],
    provides: ['docker-worker-artifacts'],
    run: async (requirements, utils) => {
      // The docker-worker build currently requires npm packages that must be compiled,
      // and the local system does not have the necessary package installed to do so,
      // so we build the docker-worker image in a docker container.

      utils.step({title: 'Pull Docker Image'});

      const nodeVersion = (await readRepoJSON('package.json')).engines.node;
      const image = 'node:' + nodeVersion;
      await dockerPull({image, utils, baseDir});

      utils.step({title: 'Build Docker-Worker Tarball'});

      await dockerRun({
        baseDir,
        logfile: path.join(logsDir, '/docker-worker-build.log'),
        image,
        mounts: [
          {
            Type: 'bind',
            Source: path.join(REPO_ROOT, 'workers', 'docker-worker'),
            Target: '/src',
            ReadOnly: true,
          }, {
            Type: 'bind',
            Source: artifactsDir,
            Target: '/dst',
            ReadOnly: false,
          },
        ],
        command: ['sh', './release.sh', '-o', '/dst/docker-worker-x64.tgz'],
        workingDir: '/src',
        utils,
      });

      const artifacts = ['docker-worker-x64.tgz'];

      return {
        'docker-worker-artifacts': artifacts,
      };
    },
  });

  ensureTask(tasks, {
    title: 'Build generic-worker artifacts',
    requires: ['cleaned-release-artifacts'],
    provides: ['generic-worker-artifacts'],
    run: async (requirements, utils) => {
      await execCommand({
        dir: path.join(REPO_ROOT, 'workers', 'generic-worker'),
        command: ['./build.sh', '-p', '-o', artifactsDir],
        utils,
      });

      const artifacts = glob.sync('generic-worker-*', {cwd: artifactsDir});

      return {
        'generic-worker-artifacts': artifacts,
      };
    },
  });

  ensureTask(tasks, {
    title: 'Build worker-runner artifacts',
    requires: ['cleaned-release-artifacts'],
    provides: ['worker-runner-artifacts'],
    run: async (requirements, utils) => {
      await execCommand({
        dir: path.join(REPO_ROOT, 'tools', 'worker-runner'),
        command: ['./build.sh', artifactsDir],
        utils,
      });

      const artifacts = glob.sync('start-worker-*', {cwd: artifactsDir});

      return {
        'worker-runner-artifacts': artifacts,
      };
    },
  });

  ensureTask(tasks, {
    title: 'Build livelog artifacts',
    requires: ['cleaned-release-artifacts'],
    provides: ['livelog-artifacts'],
    run: async (requirements, utils) => {
      await execCommand({
        dir: path.join(REPO_ROOT, 'tools', 'livelog'),
        command: ['./build.sh', artifactsDir],
        utils,
      });

      const artifacts = glob.sync('livelog-*', {cwd: artifactsDir});

      return {
        'livelog-artifacts': artifacts,
      };
    },
  });

  ensureTask(tasks, {
    title: 'Build taskcluster-proxy artifacts',
    requires: ['cleaned-release-artifacts'],
    provides: ['taskcluster-proxy-artifacts'],
    run: async (requirements, utils) => {
      await execCommand({
        dir: path.join(REPO_ROOT, 'tools', 'taskcluster-proxy'),
        command: ['./dockerbuild.sh', artifactsDir],
        utils,
      });

      const artifacts = glob.sync('taskcluster-proxy-*', {cwd: artifactsDir});

      return {
        'taskcluster-proxy-artifacts': artifacts,
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
      utils.step({title: 'Check Repository'});

      const tag = `taskcluster/websocktunnel:${requirements['release-version']}`;
      const provides = {
        'websocktunnel-docker-image': tag,
      };

      utils.step({title: 'Building Websocktunnel'});

      const contextDir = path.join(baseDir, 'websocktunnel-build');
      await execCommand({
        command: [
          'go', 'build',
          '-o', path.join(contextDir, 'websocktunnel'),
          './tools/websocktunnel/cmd/websocktunnel',
        ],
        dir: REPO_ROOT,
        logfile: path.join(logsDir, '/websocktunnel-build.log'),
        utils,
        env: {CGO_ENABLED: '0', ...process.env},
      });

      utils.step({title: 'Building Docker Image'});

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
        env: {DOCKER_BUILDKIT: 1, ...process.env},
      });

      if (cmdOptions.staging) {
        return provides;
      }

      utils.step({title: 'Pushing Docker Image'});

      const dockerPushOptions = {};
      if (credentials.dockerUsername && credentials.dockerPassword) {
        dockerPushOptions.credentials = {
          username: credentials.dockerUsername,
          password: credentials.dockerPassword,
        };
      }

      await dockerPush({
        logfile: path.join(logsDir, 'docker-push.log'),
        tag,
        utils,
        baseDir,
        ...dockerPushOptions,
      });

      return provides;
    },
  });

  ensureTask(tasks, {
    title: 'Build livelog Docker Image',
    requires: [
      'release-version',
      'docker-flow-version',
    ],
    provides: [
      'livelog-docker-image', // image tag
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      utils.step({title: 'Check Repository'});

      const tag = `taskcluster/livelog:${requirements['release-version']}`;
      const provides = {
        'livelog-docker-image': tag,
      };

      utils.step({title: 'Building Livelog'});

      const contextDir = path.join(baseDir, 'livelog-build');
      await execCommand({
        command: [
          'go', 'build',
          '-o', path.join(contextDir, 'livelog'),
          './tools/livelog',
        ],
        dir: REPO_ROOT,
        logfile: path.join(logsDir, 'livelog-build.log'),
        utils,
        env: {CGO_ENABLED: '0', ...process.env},
      });

      utils.step({title: 'Building Docker Image'});

      fs.writeFileSync(
        path.join(contextDir, 'version.json'),
        requirements['docker-flow-version']);

      // this simple Dockerfile just packages the binary into a Docker image
      const dockerfile = path.join(contextDir, 'Dockerfile');
      fs.writeFileSync(dockerfile, [
        'FROM progrium/busybox',
        'EXPOSE 60023',
        'EXPOSE 60022',
        'COPY version.json /app/version.json',
        'COPY livelog /livelog',
        'ENTRYPOINT ["/livelog"]',
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
        logfile: path.join(logsDir, 'livelog-docker-build.log'),
        utils,
        env: {DOCKER_BUILDKIT: 1, ...process.env},
      });

      if (cmdOptions.staging) {
        return provides;
      }

      utils.step({title: 'Pushing Docker Image'});

      const dockerPushOptions = {};
      if (credentials.dockerUsername && credentials.dockerPassword) {
        dockerPushOptions.credentials = {
          username: credentials.dockerUsername,
          password: credentials.dockerPassword,
        };
      }

      await dockerPush({
        logfile: path.join(logsDir, 'livelog-docker-push.log'),
        tag,
        utils,
        baseDir,
        ...dockerPushOptions,
      });

      return provides;
    },
  });

  ensureTask(tasks, {
    title: 'Build taskcluster-proxy Docker image',
    requires: ['release-version', 'docker-flow-version'],
    provides: ['taskcluster-proxy-docker-image'],
    locks: ['docker'],
    run: async (requirements, utils) => {
      utils.step({title: 'Check Repository'});

      const tag = `taskcluster/taskcluster-proxy:${requirements['release-version']}`;
      const provides = {'taskcluster-proxy-docker-image': tag};

      utils.step({title: 'Building taskcluster-proxy'});

      const contextDir = path.join(baseDir, 'taskcluster-proxy-build');
      await execCommand({
        command: [
          'go', 'build',
          '-o', path.join(contextDir, 'taskcluster-proxy'),
          './tools/taskcluster-proxy',
        ],
        dir: REPO_ROOT,
        logfile: path.join(logsDir, 'taskcluster-proxy-build.log'),
        utils,
        env: {CGO_ENABLED: '0', ...process.env},
      });

      utils.step({title: 'Building Docker Image'});

      fs.writeFileSync(
        path.join(contextDir, 'version.json'),
        requirements['docker-flow-version']);

      // this simple Dockerfile just packages the binary into a Docker image
      const dockerfile = path.join(contextDir, 'Dockerfile');
      fs.writeFileSync(dockerfile, [
        // get the latest ca-certificates from Ubuntu
        'FROM ubuntu:latest as ubuntu',
        'RUN apt-get update',
        'RUN apt-get install -y ca-certificates',
        // start over in an empty image and just copy the certs in
        'FROM scratch',
        'EXPOSE 80',
        'COPY version.json /app/version.json',
        'COPY taskcluster-proxy /taskcluster-proxy',
        'COPY --from=ubuntu /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt',
        'ENTRYPOINT ["/taskcluster-proxy", "--port", "80"]',
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
        logfile: path.join(logsDir, 'taskcluster-proxy-docker-build.log'),
        utils,
        env: {DOCKER_BUILDKIT: 1, ...process.env},
      });

      if (cmdOptions.staging) {
        return provides;
      }

      utils.step({title: 'Pushing Docker Image'});

      const dockerPushOptions = {};
      if (credentials.dockerUsername && credentials.dockerPassword) {
        dockerPushOptions.credentials = {
          username: credentials.dockerUsername,
          password: credentials.dockerPassword,
        };
      }

      await dockerPush({
        logfile: path.join(logsDir, 'docker-push.log'),
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
      'release-version',
      'client-shell-artifacts',
      'generic-worker-artifacts',
      'docker-worker-artifacts',
      'worker-runner-artifacts',
      'taskcluster-proxy-artifacts',
      'changelog-text',
      'target-monoimage',
      'websocktunnel-docker-image',
      'livelog-docker-image',
      'taskcluster-proxy-docker-image',
      'livelog-artifacts',
    ],
    provides: [
      'github-release',
    ],
    run: async (requirements, utils) => {
      const octokit = new Octokit({auth: `token ${credentials.ghToken}`});

      utils.status({message: `Create Release`});
      const release = await octokit.repos.createRelease({
        owner: 'taskcluster',
        repo: cmdOptions.staging ? 'staging-releases' : 'taskcluster',
        tag_name: `v${requirements['release-version']}`,
        name: `v${requirements['release-version']}`,
        body: await requirements['changelog-text'],
        draft: cmdOptions.staging ? true : false,
        prerelease: false,
      });
      const {upload_url} = release.data;

      const files = requirements['client-shell-artifacts']
        .concat(requirements['generic-worker-artifacts'])
        .concat(requirements['docker-worker-artifacts'])
        .concat(requirements['worker-runner-artifacts'])
        .concat(requirements['livelog-artifacts'])
        .concat(requirements['taskcluster-proxy-artifacts'])
        .map(name => ({name, contentType: 'application/octet-stream'}));
      for (let {name, contentType} of files) {
        utils.status({message: `Upload Release asset ${name}`});
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
            utils.status({message: `Upload release asset ${name} - retrying after error`});
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
      if (cmdOptions.staging) {
        return utils.skip();
      }

      await npmPublish({
        dir: path.join(REPO_ROOT, 'clients/client'),
        apiToken: credentials.npmToken,
        logfile: path.join(logsDir, `publish-clients-client.log`),
        utils});
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

      if (cmdOptions.staging) {
        return;
      }

      await npmPublish({
        dir,
        apiToken: credentials.npmToken,
        logfile: path.join(logsDir, `publish-clients-client-web.log`),
        utils});
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
      if (cmdOptions.staging) {
        return utils.skip();
      }

      await pyClientRelease({
        dir: path.join(REPO_ROOT, 'clients', 'client-py'),
        username: credentials.pypiUsername,
        password: credentials.pypiPassword,
        logfile: path.join(logsDir, 'publish-client-py.log'),
        utils});
    },
  });

  ensureTask(tasks, {
    title: 'Publish Complete',
    requires: [
      'target-monoimage',
      'github-release',
      'publish-clients/client',
      'publish-clients/client-web',
      'publish-clients/client-py',
    ],
    provides: [
      'target-publish',
    ],
    run: async (requirements, utils) => {
      // this just gathers requirements into a single target..
    },
  });
};
