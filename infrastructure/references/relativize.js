const fs = require('fs');
const References = require('taskcluster-lib-references');

const build = (input, output, rootUrl) => {
  const serializable = JSON.parse(fs.readFileSync(input, {encoding: 'utf8'}));
  const refs = References.fromSerializable({serializable});
  refs.asAbsolute(rootUrl).writeUriStructured({directory: output});
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

exports.build = build;
