const program = require('commander');
const {version} = require('../package.json');

program.version(version);
program.command('build <input-cluster-spec> <output-cluster-spec>')
  .option('-p, --push', 'Push images to docker hub')
  .option('--base-dir <base-dir>', 'Base directory for build (fast and big!; default /tmp/taskcluster-installer-build)')
  .option('--no-cache', 'Do not use any cached state, instead building everything from scratch')
  .action((input, output, options) => {
    require('./build')(input, output, options).then(
      () => {},
      err => {
        console.error(err);
        process.exit(1);
      });
  });

program.command('deploy <input-cluster-spec> <k8s-output>')
  .option('--infra-info <infra-info>', 'JSON file with info about the infrastructure')
  .action((input, output, options) => {
    require('./deploy')(input, output, options.infraInfo).then(
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
