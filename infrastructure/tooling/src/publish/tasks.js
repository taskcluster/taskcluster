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
  dockerPush,
  REPO_ROOT,
} = require('../utils');

const readFile = util.promisify(fs.readFile);

module.exports = ({tasks, cmdOptions, credentials, baseDir, logsDir}) => {
  const artifactsDir = path.join(baseDir, 'release-artifacts');

  ensureTask(tasks, {
    title: 'Get release version',
    requires: [],
    provides: ['release-version'],
    run: async (requirements, utils) => {
      if (cmdOptions.staging) {
        return {
          'release-version': '9999.99.99',
        };
      }

      const {gitDescription} = await gitDescribe({
        dir: REPO_ROOT,
        utils,
      });

      if (!gitDescription.match(/^v\d+\.\d+\.\d+$/)) {
        throw new Error(`Can only publish releases from git revisions with tags of the form vX.Y.Z, not ${gitDescription}`);
      }

      return {
        'release-version': gitDescription.slice(1),
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

  /*
   * https://github.com/taskcluster/taskcluster/issues/2739
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
  */

  ensureTask(tasks, {
    title: 'Build Websocktunnel Docker Image',
    requires: [
      'release-version',
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
        env: process.env,
      });

      utils.step({title: 'Building Docker Image'});

      // this simple Dockerfile just packages the binary into a Docker image
      const dockerfile = path.join(contextDir, 'Dockerfile');
      fs.writeFileSync(dockerfile, [
        'FROM scratch',
        'COPY websocktunnel /websocktunnel',
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

      if (!cmdOptions.staging) {
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
      }

      return provides;
    },
  });

  ensureTask(tasks, {
    title: 'Build livelog Docker Image',
    requires: [
      'release-version',
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
        env: process.env,
      });

      utils.step({title: 'Building Docker Image'});

      // this simple Dockerfile just packages the binary into a Docker image
      const dockerfile = path.join(contextDir, 'Dockerfile');
      fs.writeFileSync(dockerfile, [
        'FROM progrium/busybox',
        'EXPOSE 60023',
        'EXPOSE 60022',
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

      if (!cmdOptions.staging) {
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
      }

      return provides;
    },
  });

  /* https://github.com/taskcluster/taskcluster/issues/2739
  ensureTask(tasks, {
    title: 'Build taskcluster-proxy Docker image',
    requires: ['release-version'],
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
        env: process.env,
      });

      utils.step({title: 'Generating ca certs using latest ubuntu version'});

      const cacerts = path.join(contextDir, 'cacerts.docker');
      fs.writeFileSync(cacerts, [
        'FROM ubuntu:latest',
        'RUN apt-get update',
        'RUN apt-get install -y ca-certificates',
      ].join('\n'));
      await execCommand({
        command: [
          'uid="$(date +%s)"', '&&',
          'docker', 'build', '--pull', '-t', '"${uid}"', '-f', 'cacerts.docker', '.', '&&',
          'docker', 'run', '--name', '"${uid}"', '"${uid}"', '&&',
          'docker', 'cp', '"${uid}:/etc/ssl/certs/ca-certificates.crt"', 'target', '&&',
          'docker', 'rm', '-v', '"${uid}"',
        ],
        dir: REPO_ROOT,
        logfile: path.join(logsDir, 'taskcluster-proxy-cert-gen.log'),
        utils,
        env: process.env,
      });

      utils.step({title: 'Building Docker Image'});

      // this simple Dockerfile just packages the binary into a Docker image
      const dockerfile = path.join(contextDir, 'Dockerfile');
      fs.writeFileSync(dockerfile, [
        'FROM scratch',
        'EXPOSE 80',
        'COPY target/taskcluster-proxy /taskcluster-proxy',
        'COPY target/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt',
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

      if (!cmdOptions.staging) {
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
      }

      return provides;
    },
  });
  /*

  /* -- monoimage docker image build occurs here -- */

  ensureTask(tasks, {
    title: 'Create GitHub Release',
    requires: [
      'release-version',
      'client-shell-artifacts',
      'generic-worker-artifacts',
      'worker-runner-artifacts',
      //'taskcluster-proxy-artifacts',
      'changelog-text',
      'target-monoimage',
      'websocktunnel-docker-image',
      'livelog-docker-image',
      //'taskcluster-proxy-docker-image',
      'livelog-artifacts',
    ],
    provides: [
      'github-release',
    ],
    run: async (requirements, utils) => {
      if (!cmdOptions.push) {
        return utils.skip({});
      }

      const octokit = new Octokit({auth: `token ${credentials.ghToken}`});

      utils.status({message: `Create Release`});
      const release = await octokit.repos.createRelease({
        owner: 'taskcluster',
        repo: 'taskcluster',
        tag_name: `v${requirements['release-version']}`,
        name: `v${requirements['release-version']}`,
        body: await requirements['changelog-text'],
        draft: false,
        prerelease: false,
      });
      const {upload_url} = release.data;

      const files = requirements['client-shell-artifacts']
        .concat(requirements['generic-worker-artifacts'])
        .concat(requirements['worker-runner-artifacts'])
        .concat(requirements['livelog-artifacts'])
        //.concat(requirements['taskcluster-proxy-artifacts'])
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
      'github-releaee', // to make sure the release finishes first..
    ],
    provides: [
      `publish-clients/client`,
    ],
    run: async (requirements, utils) => {
      if (!cmdOptions.push) {
        return utils.skip({});
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
      'github-releaee', // to make sure the release finishes first..
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

      if (!cmdOptions.push) {
        return utils.skip({});
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
      'github-releaee', // to make sure the release finishes first..
    ],
    provides: [
      `publish-clients/client-py`,
    ],
    run: async (requirements, utils) => {
      if (!cmdOptions.push) {
        return utils.skip({});
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
