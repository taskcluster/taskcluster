#! /usr/bin/env node --harmony

/**
Interactive configuration of the deploy configuration for the docker worker.
*/
var co = require('co');
var fs = require('fs');
var fsPath = require('path');
var color = require('cli-color');
var prompt = require('co-prompt');
var util = require('util');

var CONFIG = fsPath.resolve(process.argv[2] || __dirname + '/../deploy.json');
var VARIABLES = require('../variables');

function* question(field, desc) {
  return yield prompt(
    '  ' + color.cyan(field) + ' (' + color.white(desc) + ') : '
  );
}

function* configure() {
  // Current configuration for the deploy...
  var currentConfig = {};

  // Load the config file if it exists to override the defaults...
  if (fs.existsSync(CONFIG)) {
    currentConfig = require(CONFIG);
  }

  // Prompt for all the configurations.
  for (var key in VARIABLES) {
    var desc = VARIABLES[key].description;
    var defaultValue = currentConfig[key] || VARIABLES[key].value

    var humanDesc =
      color.white(key + ': ') +
      color.cyanBright(
        desc + (defaultValue ? ' (' + defaultValue + ')' : '') + ': '
      );

    currentConfig[key] = (yield prompt(humanDesc)) || defaultValue;
  }

  console.log();
  console.log(util.inspect(currentConfig, { colors: true }));
  console.log();

  // Yeah bad things will happen if rejected too often...
  if (!(yield prompt.confirm("Does this look right? "))) {
    return yield configure();
  }

  // Stop waiting for user input so the process will exit.
  process.stdin.end();
  return currentConfig;
}

co(function*() {
  console.log(color.yellowBright('Deploy configuration') + '\n');
  var config = yield configure();
  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2));
  console.log(color.yellowBright('Configured wrote to: ' + CONFIG) + '\n');
})(function(err) {
  if (err) throw err;
  process.exit();
});
