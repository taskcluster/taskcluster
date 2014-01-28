'use strict';

/*!
 * Module dependencies.
 */
var util = require('util');
var events = require("events");
var path = require('path');
var glob = require('glob');
var spawn = require('child_process').spawn;
var _s = require('underscore.string');

var domain = require('domain').create();

require('colors');

/**
 * Exports
 */

module.exports = exports = helmsman;

exports.Helmsman = Helmsman;

/**
 * The Helmsman constructor
 *
 * Options:
 *
 *   * prefix: The prefix of the script files. eg: 'git-''
 *
 * @param  {object} options   config
 */
function Helmsman(options){
  var self = this;

  events.EventEmitter.call(self);

  if (!options) { options = {}; }

  if (!options.localDir) {
    this.localDir = path.dirname(module.parent.filename);
  } else {
    this.localDir = path.resolve(options.localDir);
  }

  // Guess the prefix. Assume if one isn't given and that executable doesn't equal
  // the root command filename, use the filename of the root command
  if (!options.prefix && path.basename(process.argv[1]) !== path.basename(require.main.filename)) {
    this.prefix = path.basename(require.main.filename,
      path.extname(require.main.filename));
  } else {
    this.prefix = options.prefix || path.basename(process.argv[1],
      path.extname(process.argv[1]));
  }

  this.availableCommands = {};
  this.commandMaxLength = 18; //For printing help later, 18 is help <sub-command>

  // Add a dash to the end if none was provided
  if (this.prefix.substr(-1) !== '-') {
    this.prefix += '-';
  }

  // Local files in files in the /bin folder for an application
  this.localFiles = glob.sync(self.prefix + "*", { cwd: self.localDir })
    .map(function (file) {
      return path.join(self.localDir, file);
    });

  this.localFiles.forEach(function(file) {
    var extension = path.extname(file);
    var name = path.basename(file, extension).substr(self.prefix.length);

    var commandData = require(file).command;

    if (!commandData) {
      util.error('The file ('+file+') did not export.command. Please ensure your commands are setup properly and your prefix is correct'.red);
      process.exit(1);
    }

    commandData.path = file;

    self.availableCommands[name] = commandData;

    var fullCommand = commandData.arguments ?
      name + ' ' + commandData.arguments :
      name;

    // Figure out the longest command name for printing --help
    if (fullCommand.length > self.commandMaxLength) {
      self.commandMaxLength = name.length;
    }
  });

  // help is always available!
  self.availableCommands['help'] = {
    arguments: '<sub-command>',
    description: 'Show the --help for a specific command'
  };
}

util.inherits(Helmsman, events.EventEmitter);


/**
 * Simplify creating a new Helmsman Object
 *
 * Example:
 *
 *   var helmsman = require('helmsman');
 *
 *   var cli = helmsman();
 *   cli.parse();
 *
 * @param  {Object} options   Contructor options
 * @return {Helmsman}         A new helmsman
 */

function helmsman(options){
  return new Helmsman(options);
}


/**
 * Determine the subcommand to run
 *
 *  Try:
 *    * Explicit match (status === status)
 *    * Shorthand (st === status)
 *    * Levenshtein of <=2 (sratus === status)
 *
 * @param  {String} cmd The command given to the script
 * @param  {[String]} availableCommands An array of all the available commands
 * @return {String}     The actual command that will be run
 */
Helmsman.prototype.getCommand = function(cmd, availableCommands){
  var self = this;

  if (!availableCommands) {
    availableCommands = Object.keys(self.availableCommands);
  }

  // If there is an exact match, return it
  if (~availableCommands.indexOf(cmd)) {
    return cmd;
  }

  // Determine how many commands match the iterator. Return one if command,
  function isOneOrMore(commands, iterator){
    var list = commands.filter(iterator);

    if (list.length === 1) {
      return list[0];
    } else if (list.length > 1) {
      return new Error(util.format('There are %d options for "%s": %s',
        list.length, cmd, list.join(', ')));
    } else {
      return false;
    }
  }

  // If there is a shorthand match, return it
  var shortHandCmd = isOneOrMore(availableCommands, function(command){
    return (command.indexOf(cmd) === 0);
  });
  if (shortHandCmd) { return shortHandCmd; }

  // If there is a close match, return it
  var similarCmd = isOneOrMore(availableCommands, function(command){
    return (_s.levenshtein(cmd, command) <= 2);
  });
  if (similarCmd) { return similarCmd; }

  // If nothing, then get outta here
  return new Error(util.format('There are no commands by the name of "%s"',
    cmd));
};

/**
 * GO!
 *
 * @param {[Object]} argv   The process arguments to parse. Defaults to process.argv
 */

Helmsman.prototype.parse = function(argv){
  var self = this;

  argv = argv || process.argv; // If no arguments are passed, assume process.argv

  var args = argv.slice(2);

  // Much of the following heavily inspired or simply taken from component/bin
  // https://github.com/component/component/blob/master/bin/component

  // Print the modules version number
  if (args[0] === '--version') {
    // BOLD assumption that the file is in ./bin
    var packagePath = path.join(path.dirname(require.main.filename), '..',
      'package.json');
    var pkg = require(packagePath);
    return console.log(pkg.name + ": " + pkg.version);
  }

  // Print the command list if --help is called
  if (args[0] === '--help' ||
    !args.length ||
    args[0][0] === '-' ||
    (args[0] === 'help' && args.length === 1) ||
    (self.getCommand(args[0]) === 'help' && args.length === 1)) {
    self.emit('--help');
    return self.showHelp();
  }

  var cmd = self.getCommand(args.shift());

  if (util.isError(cmd)) {
    util.error(cmd.message.red);
    self.showHelp();
    process.exit(1);
  }

  // Implicit help
  // If <command> help <sub-command> is entered, automatically run <command>-<sub-command> --help
  if (cmd === 'help') {
    cmd = args.shift();
    args = ['--help'];
  }

  var fullPath = self.availableCommands[cmd] &&
    self.availableCommands[cmd].path;

  domain.on('error', function(err) {
    if (err.code === 'EACCES') {
      console.error('');
      console.error('Could not execute the subcommand: ' + self.prefix + cmd);
      console.error('');
      console.error('Consider running:\n chmod +x', fullPath);
    } else {
      console.error(err.stack.red);
    }
  });

  domain.run(function() {
    var subcommand = spawn(fullPath, args, { stdio: 'inherit' });

    subcommand.on('close', function(code){
      process.exit(code);
    });
  });
};


/**
 * Show the help
 */

Helmsman.prototype.showHelp = function(){
  var self = this;
  var fullCommands = [];

  console.log('');
  console.log('Commands:');
  console.log('');

  for (var command in self.availableCommands) {
    var fullCommand = command;

    if (self.availableCommands[command].arguments) {
      fullCommand += ' ' + self.availableCommands[command].arguments;
    }

    if (fullCommand.length > self.commandMaxLength) {
      self.commandMaxLength = fullCommand.length;
    }

    fullCommands.push([fullCommand, self.availableCommands[command].description]);
  }

  fullCommands.forEach(function(command){
    var diff = (self.commandMaxLength - command[0].length);

    // Pad spaces at the end of each command so help descriptions line up
    for (var i = 0; i < diff; i++) {
      command[0] += ' ';
    }

    console.log('   %s     %s', command[0], command[1]);
  });

  process.exit();
};
