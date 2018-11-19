const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const path = require('path');
const fs = require('fs');

const writeUriStructured = ({directory, serializable}) => {
  rimraf.sync(directory);

  const dirs = new Set();
  for (let {filename, content} of serializable) {
    const pathname = path.join(directory, filename);
    const dirname = path.dirname(pathname);
    if (!dirs.has(dirname)) {
      mkdirp.sync(dirname);
      dirs.add(dirname);
    }
    fs.writeFileSync(pathname, JSON.stringify(content, null, 2));
  }
};

const readUriStructured = ({directory}) => {
  const files = [];

  const queue = ['.'];
  while (queue.length) {
    const filename = queue.shift();
    const fqfilename = path.join(directory, filename);
    const st = fs.lstatSync(fqfilename);
    if (st.isDirectory()) {
      for (let dentry of fs.readdirSync(fqfilename)) {
        queue.push(path.join(filename, dentry));
      }
    } else {
      files.push({
        filename,
        content: JSON.parse(fs.readFileSync(fqfilename)),
      });
    }
  }

  return files;
};

exports.writeUriStructured = writeUriStructured;
exports.readUriStructured = readUriStructured;
