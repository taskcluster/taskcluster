const errorStackParser = require('error-stack-parser');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../..'); const suiteName = () => {
  const o = {}; Error.captureStackTrace(o, suiteName);
  const stack = errorStackParser.parse(o);
  return path.relative(ROOT_DIR, stack[0].fileName);
};

module.exports = suiteName;
