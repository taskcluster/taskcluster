import errorStackParser from 'error-stack-parser';
import path from 'path';

const __dirname = new URL('.', import.meta.url).pathname;

const ROOT_DIR = path.resolve(__dirname, '../../..');

const suiteName = () => {
  const o = {}; Error.captureStackTrace(o, suiteName);
  const stack = errorStackParser.parse(o);
  return path.relative(ROOT_DIR, stack[0].fileName);
};

export default suiteName;
