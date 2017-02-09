const Github = require('github');
const load = require('../lib/main');
const child_process = require('child_process');
const fs = require('fs-extra');
const _ = require('lodash');

const runCommand = (args) => {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${args.join(' ')}`);
    const proc = child_process.spawn(args.shift(), args, {stdio: ['ignore', 'pipe', 2]});
    const output = [];

    proc.stdout.on('data', data => {
      console.error(data.toString());
      output.push(data);
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve(output.join('').toString());
      } else {
        reject(new Error('git command failed'));
      }
    });
  });
};

const checkStaging = async () => {
  let github = new Github();

  // push a commit to the repo and get its sha
  let sha = await pushCommit();

  const update = msg => {
    console.log(`** ${msg}`);
  };

  update(`polling integration status of https://github.com/taskcluster/taskcluster-github-testing/commit/${sha}`);

  let done = false;
  while (!done) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    let statuses = await github.repos.getStatuses({
      owner: 'taskcluster',
      repo: 'taskcluster-github-testing',
      sha,
    });

    let status = _.find(statuses, {context: 'Taskcluster-Staging (push)'});
    if (!status) {
      update('no Taskcluster-Staging (push) status');
      continue;
    }

    update(`state: ${status.state}`);
    switch (status.state) {
      case 'pending':
        break;

      case 'failed':
        throw new Error('task run failed');
        break;

      case 'success':
        done = true;
        update('PASSED');
        break;

      default:
        throw new Error(`unexpected status state ${status.state}`);
        break;
    }
  }
};

// push a dummy comit to taskcluster-github-testing
const pushCommit = async () => {
  let tempdir = fs.mkdtempSync('/tmp/tc-gh-checkStaging-');
  try {
    process.chdir(tempdir);
    await runCommand(['git', 'clone', 'git@github.com:taskcluster/taskcluster-github-testing.git', 'testing']);
    process.chdir('testing');
    fs.writeFileSync('README.md',
        'This repository is used to support `npm run checkStaging` in taskcluster-github\n\n' +
        `Last run: ${new Date()}`);
    await runCommand(['git', 'add', 'README.md']);
    await runCommand(['git', 'commit', '-m', 'checkStaging run']);
    await runCommand(['git', 'push']);
    return (await runCommand(['git', 'log', '-1', '--pretty=format:%H'])).trim();
  } finally {
    console.error(`removing ${tempdir}`);
    fs.removeSync(tempdir);
  }
};

checkStaging().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
