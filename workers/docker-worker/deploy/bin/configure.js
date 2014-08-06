var co = require('co');
var fs = require('co-fs');
var fsPath = require('path');
var color = require('cli-color');
var prompt = require('co-prompt');
var util = require('util');
var program = require('commander');

var TARGET_ROOT = fsPath.resolve(__dirname, '..', 'packer/');
var CONFIG_ROOT = fsPath.resolve(TARGET_ROOT, '..', 'config/');

var DESCRIPTIONS = {
  app: {
    environment: 'Shell script file which can setup the environement ' +
                 '(such as exporting environment variables)',
    source_ami: 'Base AMI which this image depends on.',
    loggly_account: 'Loggly account name',
    loggly_auth: 'Loggly authentication token',
    fs_type: 'Docker filesystem type (aufs, btrfs)'
  },
  base: {}
};

function* getTarget(name) {
  var fullPath = fsPath.join(TARGET_ROOT, name);
  var json = require(fullPath);

  return {
    name: name.replace('.json', ''),
    path: fullPath,
    config: json
  };
}

function* getTargets() {
  var targetList = {};
  var dirs = (yield fs.readdir(TARGET_ROOT)).filter(function(name) {
    return name.split('.').pop() === 'json';
  });

  return yield dirs.map(getTarget);
}

var descriptions = {
}

function* question(field, desc) {
  return yield prompt(
    '  ' + color.cyan(field) + ' (' + color.white(desc) + ') : '
  );
}

function* configure(target) {
  if (!Object.keys(DESCRIPTIONS[target.name]).length) {
    return;
  }

  // figure out current config path
  var configPath = CONFIG_ROOT + '/' + target.name + '.json';

  console.log(
    color.greenBright('packer target: ' + target.name) + ' - ' +
    color.greenBright(target.config.description)
  );

  var defaults = {};
  if (yield fs.exists(configPath)) {
    defaults = require(configPath);
  }

  // Prompt for all the configurations.
  var results = {};
  for (var key in DESCRIPTIONS[target.name]) {
    var desc = DESCRIPTIONS[target.name][key];
    var defaultValue = defaults[key] || target.config.variables[key];

    var humanDesc =
      color.white(key + ': ') +
      color.cyanBright(
        desc + (defaultValue ? ' (' + defaultValue + ')' : '') + ': '
      );

    results[key] = (yield prompt(humanDesc)) || defaultValue;
  }

  console.log();
  console.log(util.inspect(results, { colors: true }));
  console.log();

  // Yeah bad things will happen if rejected too often...
  if (!(yield prompt.confirm("Does this look right? "))) {
    return yield configure(target);
  }

  yield fs.writeFile(configPath, JSON.stringify(results, null, 4));
}

co(function*() {
  console.log(color.yellowBright('Packer configuration helper') + '\n');

  var targets = yield getTargets();

  for (var i = 0; i < targets.length; i++) {
    yield configure(targets[i]);
  }
})(function(err) {
  if (err) throw err;
  process.exit();
});
