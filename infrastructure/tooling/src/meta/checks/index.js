const fs = require('fs');

const checks = [];

/**
 * Each file in this directory is expected to export `tasks` containing a list of
 * console-taskgraph tasks.
 */

fs.readdirSync(`${__dirname}/`).forEach(file => {
  if (file !== 'index.js' && file.match(/\.js$/)) {
    const {tasks} = require(`./${file}`);

    for (let task of tasks) {
      checks.push(task);
    }
  }
});

exports.checks = checks;
