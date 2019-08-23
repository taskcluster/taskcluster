const fs = require('fs');

const checks = [];

/**
 * Each file in this directory is expected to export `tasks` containing a list of
 * console-taskgraph tasks.
 *
 * The "main" task should provide (in `provides`) a requirement named `target-foo` for
 * some foo.
 */

fs.readdirSync(`${__dirname}/`).forEach(file => {
  if (file !== 'index.js' && file.match(/\.js$/)) {
    const exports = require(`./${file}`);
    exports.tasks.forEach(val => checks.push(val));
  }
});

module.exports = checks;
