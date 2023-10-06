import url from 'url';
import { enumFiles } from '../../utils/index.js';
import path from 'path';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
/**
 * Each file in this directory is expected to export a task-generation function taking
 * {tasks, cmdOptions, credentials, baseDir, logsDir} and appending tasks to its tasks
 * argument.
 */

export const generateTasks = async (options) => {
  const files = enumFiles(__dirname);

  await Promise.all(files.map(async (file) => {
    const { default: gen } = await import(path.join(__dirname, file));
    gen(options);
  }));

};
