#! /usr/bin/env node

const program = require('commander');
const {version} = require('../../../package.json');

program.version(version);
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
  .option('--dry-run', 'Do not run any tasks, but generate the list of tasks')
  .option('-p, --push', 'Push docker image and git commit + tag (without this, changes are purely local)')
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

program.command('*', {noHelp: true})
  .action(() => program.help(txt => txt));

program.parse(process.argv);
if (!program.args.length) {
  program.help();
}
