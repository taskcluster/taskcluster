import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Create a fresh temporary directory, populated from `tree`.  Each key of
 * `tree` is a path relative to the directory; a string value is written as
 * file contents and an object value is created as a nested tree.  Returns the
 * directory's path.
 */
export const makeTmpTree = async (tree = {}) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-references-test-'));
  await writeTree(root, tree);
  return root;
};

const writeTree = async (dir, tree) => {
  for (const [name, value] of Object.entries(tree)) {
    const filename = path.join(dir, name);
    if (typeof value === 'string') {
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, value);
    } else {
      await fs.mkdir(filename, { recursive: true });
      await writeTree(filename, value);
    }
  }
};

/**
 * Remove a directory created by makeTmpTree.
 */
export const removeTmpTree = async root => {
  if (root) {
    await fs.rm(root, { recursive: true, force: true });
  }
};
