import mkdirp from 'mkdirp';
import { rimraf } from 'rimraf';
import path from 'node:path';
import fs from 'node:fs/promises';

export const writeUriStructured = async ({ directory, serializable }) => {
  // Delete contents of directory rather than the directory itself
  // This is important when running as non-root user and the directory
  // is at the filesystem root (e.g., /references)
  await rimraf(path.join(directory, '*'), { glob: true });

  const dirs = new Set();
  for (const { filename, content } of serializable) {
    const pathname = path.join(directory, filename);
    const dirname = path.dirname(pathname);
    if (!dirs.has(dirname)) {
      await mkdirp(dirname);
      dirs.add(dirname);
    }
    await fs.writeFile(pathname, JSON.stringify(content, null, 2));
  }
};

export const readUriStructured = async ({ directory }) => {
  const files = [];

  const queue = ['.'];
  while (queue.length) {
    const filename = queue.shift();
    const fqfilename = path.join(directory, filename);
    if ((await fs.lstat(fqfilename)).isDirectory()) {
      const entries = await fs.readdir(fqfilename);
      for (const dentry of entries) {
        queue.push(path.join(filename, dentry));
      }
    } else {
      const content = await fs.readFile(fqfilename);
      files.push({
        filename,
        content: JSON.parse(content),
      });
    }
  }

  return files;
};
