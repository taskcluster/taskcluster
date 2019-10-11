#! /usr/bin/env node

const program = require('commander');
const {version} = require('../../../package.json');

program.version(version);
program.name('yarn'); // these commands are invoked via yarn
program.command('build')
  .option('-p, --push', 'Push images to docker hub')
  .option('--base-dir <base-dir>', 'Base directory for build (fast and big!; default /tmp/taskcluster-builder-build)')
  .option('--no-cache', 'Do not use any cached state, instead building everything from scratch')
  .option('--dry-run', 'Do not run any tasks, but generate the list of tasks')
  .option('--ignore-uncommitted-files', 'Do not fail if there are un-committed files in the working copy')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {main} = require('./build');
    main(options[0]).then(
      () => {},
      err => {
        console.error(err);
        process.exit(1);
      });
  });

program.command('release')
  .option('--base-dir <base-dir>', 'Base directory for build (fast and big!; default /tmp/taskcluster-builder-build)')
  .option('--gh-token <gh-token>', 'GitHub access token (required unless --no-push)')
  .option('--dry-run', 'Do not run any tasks, but generate the list of tasks')
  .option('--no-push', 'Do not push the docker image and git commit + tags (but your local repo is still modified)')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {main} = require('./release');
    main(options[0]).then(
      () => {},
      err => {
        console.error(err);
        process.exit(1);
      });
  });

program.command('generate')
  .option('--target <generator>', 'Run a specific generator, rather than all of them')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {main} = require('./generate');
    main(options[0]).then(
      () => {},
      err => {
        console.error(err);
        process.exit(1);
      });
  });

program.command('changelog')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {main} = require('./changelog');
    main(options[0]).then(
      () => {},
      err => {
        console.error(err);
        process.exit(1);
      });
  });

program.command('dev')
  .option('--init', 'Set up resources and configure')
  .option('--k8s-action <action>', 'Run a specific action (apply, delete, template)')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {main} = require('./dev');
    main(options[0]).then(
      () => {},
      err => {
        console.error(err);
        process.exit(1);
      });
  });

program.command('smoketest')
  .option('--target <target>', 'Run a specific check, rather than all of them')
  .on('--help', () => {
    const {targets} = require('./smoketest/checks');
    console.log(`\nAvailable Targets:\n${targets.map(t => `  - ${t}`).join('\n')}`);
  })
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {main} = require('./smoketest');
    main(options[0]).then(
      () => {},
      err => {
        console.error(err);
        process.exit(1);
      });
  });

program.command('*', {noHelp: true})
  .action(() => program.help(txt => txt));

program.parse(process.argv);
if (!program.args.length) {
  program.help();
}
