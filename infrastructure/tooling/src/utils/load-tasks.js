import fs from 'fs';
import path from 'path';

/**
 * Each file in this directory is expected to export `tasks` containing a list of
 * console-taskgraph tasks.
 *
 * The "main" task should provide (in `provides`) a requirement named `target-foo` for
 * some foo.
 */
export const loadTasks = async (dirname) => {
  const files = [];
  const result = [];

  fs.readdirSync(`${dirname}/`).forEach((file) => {
    if (file !== 'index.js' && file.match(/\.js$/)) {
      files.push(file);
    }
  });

  await Promise.all(files.map(async (file) => {
    const { tasks } = await import(path.join(dirname, file));
    tasks.forEach(val => result.push(val));
  }));

  return result;
};
