const {load} = require('./load');
const {update} = require('./update');
const {store} = require('./store');

const build = async (input, output, rootUrl) => {
  const {references, schemas} = await load({input});
  update({references, schemas, rootUrl});
  await store({references, schemas, output});
};

if (!module.parent) {
  if (!process.env.TASKCLUSTER_ROOT_URL) {
    console.error('TASKCLUSTER_ROOT_URL is not set');
    process.exit(1);
  }

  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) {
    console.error('usage: node src/main.js <input> <output>');
    process.exit(1);
  }

  build(input, output, process.env.TASKCLUSTER_ROOT_URL);
}
