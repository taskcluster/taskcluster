const child_process = require('child_process');
const {REPO_ROOT, readRepoYAML} = require('../utils');

module.exports = async action => {
  const config = await readRepoYAML('dev-config.yml');
  if (!config.meta || !config.meta.deploymentPrefix) {
    throw new Error('Must have configured dev-config.yml to run helm.');
  }

  const namespace = config.meta.deploymentPrefix;

  let res = child_process.spawnSync('kubectl', ['create', 'namespace', namespace]);
  let output = res.stdout.toString() + res.stderr.toString();
  if (res.status !== 0) {
    if (!output.includes('AlreadyExists')) {
      throw new Error(output);
    }
  }

  res = child_process.spawnSync('kubectl', ['config', 'set-context', '--current', '--namespace', namespace]);
  output = res.stdout.toString() + res.stderr.toString();
  console.log(output);
  if (res.status !== 0) {
    throw new Error('Failed to update kubectl context');
  }

  let extraArgs = [];
  if (action !== 'uninstall') {
    extraArgs = [
      '-f',
      './dev-config.yml',
      './infrastructure/k8s',
    ];
  }

  const helm = child_process.spawn('helm', [
    action,
    'taskcluster',
    ...extraArgs,
  ], {
    cwd: REPO_ROOT,
  });

  helm.stdout.on('data', d => console.log(d.toString()));
  helm.stderr.on('data', d => console.log(d.toString()));
  return new Promise((resolve, reject) => {
    helm.on('exit', (code, signal) => {
      if (code !== 0) {
        return reject('helm command failed');
      }
      resolve();
    });
  });
};
