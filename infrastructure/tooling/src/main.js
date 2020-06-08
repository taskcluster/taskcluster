#! /usr/bin/env node

const program = require('commander');
const {version} = require('../../../package.json');

const run = (main, arg) => {
  main(arg).then(
    () => {},
    err => {
      console.error(err);
      process.exit(1);
    });
};

program.version(version);
program.name('yarn'); // these commands are invoked via yarn
program.command('build')
  .option('-p, --push', 'Push images to docker hub')
  .option('--base-dir <base-dir>', 'Base directory for build (fast and big!; default /tmp/taskcluster-builder-build)')
  .option('--no-cache', 'Do not use any cached state, instead building everything from scratch')
  .option('--dry-run', 'Do not run any tasks, but generate the list of tasks')
  .option('--ignore-uncommitted-files', 'Do not fail if there are un-committed files in the working copy')
  .option('--logs-dir <logs-dir>', 'A directory to put debug logs. default <base-dir>/logs')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {main} = require('./build');
    run(main, options[0]);
  });

program.command('staging-release')
  // note that this is not `release --staging` to avoid danger of accidentally doing a real release
  .description('make a staging release')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {stagingRelease} = require('./release');
    run(stagingRelease, options[0]);
  });

program.command('release:publish')
  .description('publish a release based on Git tag')
  .option('--base-dir <base-dir>', 'Base directory for build (fast and big!; default /tmp/taskcluster-builder-build)')
  .option('--dry-run', 'Do not run any tasks, but generate the list of tasks')
  .option('--staging <head-ref>', 'Staging run; head-ref is of the form refs/heads/staging-release/vX.Y.Z')
  .option('--logs-dir <logs-dir>', 'A directory to put debug logs. default <base-dir>/logs')
  .on('--help', () => {
    console.log([
      '',
      'This command expects to run in automation in response to a push to CI.',
    ].join('\n'));
  })
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {main} = require('./publish');
    run(main, options[0]);
  });

program.command('generate')
  .option('--target <generator>', 'Run a specific generator, rather than all of them')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {main} = require('./generate');
    run(main, options[0]);
  });

program.command('changelog')
  .description('Add a changelog entry (required for every PR)')
  .option('--major', 'Add a major changelog entry')
  .option('--minor', 'Add a minor changelog entry')
  .option('--patch', 'Add a patch changelog entry')
  .option('--silent', 'Add a silent changelog entry (no content required)')
  .option('--deployers', 'Add a changelog entry with people who deploy Taskcluster as the audience')
  .option('--worker-deployers', 'Add a changelog entry with people who deploy Taskcluster workers as the audience')
  .option('--admins', 'Add a changelog entry with people who administrate Taskcluster as the audience')
  .option('--users', 'Add a changelog entry with people who use Taskcluster as the audience')
  .option('--developers', 'Add a changelog entry with people who modify Taskcluster as the audience')
  .option('--general', 'Add a changelog entry that does not fit into other categories')
  .option('--issue <issue>', 'Reference this issue # in the added changelog')
  .option('--bug <bug>', 'Reference this Bugzilla bug in the added changelog')
  .option('--no-bug', 'This change does not reference a bug or an issue')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {add} = require('./changelog');
    run(add, options[0]);
  });

program.command('changelog:show')
  .description('Show the changelog for the next release, checking syntax')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {show} = require('./changelog');
    run(show, options[0]);
  });

program.command('changelog:check')
  .description('Check the changelog')
  .option('--pr <pr>', 'Check that this pull request contains a changelog')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {check} = require('./changelog');
    run(check, options[0]);
  });

program.command('dev:init')
  .description('Initialize a development deployment (see dev-docs/development-process.md first)')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {init} = require('./dev');
    run(init, options[0]);
  });

program.command('dev:db:upgrade')
  .description('Run `yarn db:upgrade` for a development environment')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {dbUpgrade} = require('./dev');
    run(dbUpgrade, options[0]);
  });

program.command('dev:db:downgrade')
  .description('Run `yarn db:downgrade` for a development environment')
  .option('--db-version <v>', 'Downgrade to this DB version')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {dbDowngrade} = require('./dev');
    run(dbDowngrade, options[0]);
  });

program.command('dev:apply')
  .description('Apply changes to a development deployment')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {apply} = require('./dev');
    run(apply, options[0]);
  });

program.command('dev:delete')
  .description('Delete a development deployment')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {delete_} = require('./dev');
    run(delete_, options[0]);
  });

program.command('dev:verify')
  .description('Verify settings for a development deployment')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {verify} = require('./dev');
    run(verify, options[0]);
  });

program.command('test:meta')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {main} = require('./meta');
    run(main, options[0]);
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
    run(main, options[0]);
  });

program.command('*', {noHelp: true})
  .action(() => program.help(txt => txt));

program.parse(process.argv);
