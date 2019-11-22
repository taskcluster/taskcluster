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
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {main} = require('./build');
    run(main, options[0]);
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

program.command('dev')
  .option('--init', 'Set up resources and configure')
  .option('--k8s-action <action>', 'Run a specific action (apply, delete, template)')
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {main} = require('./dev');
    run(main, options[0]);
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

program.command('backup:run')
  .option('--include <resource>', 'Include the given resource in the backup (repeatable)', (v, p) => p.concat([v]), [])
  .option('--exclude <resource>', 'Exclude the given resource from the backup (repeatable)', (v, p) => p.concat([v]), [])
  .on('--help', () => {
    console.log([
      '',
      'By default, all tables and containers are backed up.  Use --exclude to remove resources',
      'from this default list, or --include to list specific resources that should be backed',
      'up, excluding all others.  This is commonly used to back up the QueueTasks table less',
      'frequently:',
      '',
      '  daily: `yarn backup:run --exclude table/QueueTasks`',
      '  weekly: `yarn backup:run --include table/QueueTasks`',
      '',
      'Resources are named `table/<tableName>` and `container/<containerName>`.',
    ].join('\n'));
  })
  .action((...options) => {
    if (options.length !== 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    const {backup} = require('./backup');
    run(backup, options[0]);
  });

program.command('*', {noHelp: true})
  .action(() => program.help(txt => txt));

program.parse(process.argv);
