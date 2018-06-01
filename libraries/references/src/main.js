const program = require('commander');
const {version} = require('../package.json');
const {load} = require('./load');
const {update} = require('./update');

const build = async (input, output, rootUrl) => {
  const {references, schemas} = await load(input);
  update({references, schemas, rootUrl});
};

program.version(version);
program.command('build <input> <output')
  .option('--root-url <root-url>', 'Taskcluster rootUrl for which the output should be specialized')
  .action((input, output, options) => {
    build(input, output, options.rootUrl || process.env.TASKCLUSTER_ROOT_URL).then(
      () => {},
      err => {
        console.error(err);
        process.exit(1);
      });
  });

program.parse(process.argv);
if (!program.args.length) {
  program.help();
}
