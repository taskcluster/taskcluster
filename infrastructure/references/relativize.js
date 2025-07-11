import fs from 'fs/promises';
import path from 'path';
import References from 'taskcluster-lib-references';

export const build = async (input, output, rootUrl) => {
  const serializable = JSON.parse(await fs.readFile(input, { encoding: 'utf8' }));
  const refs = References.fromSerializable({ serializable });

  // write uri-structured data to the root where nginx will serve it
  await refs.asAbsolute(rootUrl).writeUriStructured({ directory: output });

  // write out a single `references/references.json` containing the same data
  await fs.writeFile(path.join(output, 'references', 'references.json'), JSON.stringify(serializable, null, 2));
};

if (import.meta.main) {
  if (!process.env.TASKCLUSTER_ROOT_URL) {
    console.error('TASKCLUSTER_ROOT_URL is not set');
    process.exit(1);
  }

  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) {
    console.error('usage: node relativize.js <input> <output>');
    process.exit(1);
  }

  build(input, output, process.env.TASKCLUSTER_ROOT_URL);
}

export default { build };
