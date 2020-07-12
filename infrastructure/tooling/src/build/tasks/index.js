const fs = require('fs');

/**
 * Each file in this directory is expected to export a task-generation function taking
 * {tasks, cmdOptions, credentials, baseDir, logsDir} and appending tasks to its tasks
 * argument.
 */

const generateTasks = options => {
  fs.readdirSync(`${__dirname}/`).forEach(file => {
    if (file !== 'index.js' && file.match(/\.js$/)) {
      const gen = require(`./${file}`);
      gen(options);
    }
  });
};

module.exports = generateTasks;
