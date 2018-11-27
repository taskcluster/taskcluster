const program = require('commander');
const {version} = require('../package.json');

program.version(version);
program.command('build')
  .option('-p, --push', 'Push images to docker hub')
  .option('--base-dir <base-dir>', 'Base directory for build (fast and big!; default /tmp/taskcluster-builder-build)')
  .option('--no-cache', 'Do not use any cached state, instead building everything from scratch')
  .option('--target-service <service>', 'Target a specific service, rather than all services')
  .action((...options) => {
    if (options.length != 1) {
      console.error('unexpected command-line arguments');
      process.exit(1);
    }
    require('./build')(options[0]).then(
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
