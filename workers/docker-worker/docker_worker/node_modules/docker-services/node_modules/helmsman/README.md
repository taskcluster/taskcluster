# node-helmsman

Easily make command line interfaces using git style subcommands executables

## So what does helmsman actually do?

A common setup for command line applications is `<command> <subcommand> <arguments/options>` (for example: `git commit -m 'message'`). Rather than having a giant file that `switch`es or `if else`s over each potential subcommand, it's much neater to store each subcommand in it's own file (`bin/command`,`bin/command-subcomand`, `bin/command-subcommand2`, etc). Helmsman makes it easy to add, modify or delete subcommands without having to do housekeeping steps in your root command file or `package.json`

### Features

* Helmsman is automatically aware of all the `<command>-<subcommand>` files in your modules `bin/` (or any folder you tell it to look at)
* `<command> --help` automatically generates help output, telling you all the subcommands that are available to you
* `<command> --version` prints the version from package.json of the module requiring helmsman
* Running `<command> <subcommand>` automatically executes the `<command>-<subcommand>` file, passing along all the arguments & options
* Helmsman is capable of smart command completion including dynamic shorthands and spelling correction (eg: `<command> st` => `<command> status` or `<command> isntall` => `<command> install` )
* Use whatever option parsing library you want for your subcommands ([optimist](https://github.com/substack/node-optimist), [commander](https://github.com/visionmedia/commander.js), etc)
* Helmsman is [minimally intrusive in your subcommands](#setting-up-your-sub-commands-command-subcommand)

## Installation & Setup

In your command line application folder:

```
npm install helmsman --save
```

### Setting up your main executable: `<command>`

In your main executable, add `helmsman`:

```javascript
#!/usr/bin/env node

var helmsman = require('helmsman');

helmsman().parse();
```

Want to append in additional help messaging or modify the arguments that are parsed?

```javascript
#!/usr/bin/env node

var helmsman = require('helmsman');

var cli = helmsman()

cli.on('--help', function(){
  console.log('EXTRA HELPFUL!');
});

var argv = process.argv;

argv.push('--pizza');

// parse() can accept modified arguments, otherwise it defaults to process.argv
cli.parse(argv);
```

### Setting up your sub-commands: `<command>-<subcommand>`

For your sub-executables to work with `helmsman` you need to do two things: 1. Expose metadata about the task, like its description and 2. Make sure the meat & potatoes of the script only runs when it's directly called

```javascript
#!/usr/bin/env node

// 1. Expose the metadata
exports.command = {
  description: 'Show current worker counts and their pids'
};

// 2. Make sure it only runs when it's directly called:
if (require.main === module) {
  // Parse options and run the magic
}
```

**Note:** If you're not putting each script in `package.json`'s `bin` object, make sure that the sub-commands are executable by running `chmod +x bin/<command>-<sub-command>

## API

### helmsman([options]) or new Helmsman([options])

* `options` {Object}

Create an instance of `helmsman`. It is an `EventEmitter` and will also begin searching for files once it's instantiated. 

#### Events

* `--help`: Emitted when `--help` is passed as the first option or no commands or options are passed

#### Options

* `localDir`: The local module folder where to search for executable files. Defaults to the directory of the executable (eg: If you execute `<module folder>/bin/<command>` the `localDir` will be `<module folder>/bin`)
* `prefix`: The prefix of the subcommands to search for. Defaults to the executed file (eg: If you run `<command>` it will search for files in the `localDir` that start with `<command>-`

#### Methods

* `parse([argv])` Parse `argv` or `process.argv` if there is no argv and either display the help or run the subcommand

### <subcommand> `exports.command`

* `description`: A one line description of the command. Required.
* `arguments`: A shorthand for options the subcommand accepts. Generated help will include it next to command. See `help <command>`"

## TODO

* [Allow for automatically including npm installed libraries](https://github.com/mattmcmanus/node-helmsman/issues/2)

## Thanks

Much of this was inspired by TJ Holowaychuk's [commander](https://github.com/visionmedia/commander.js) and [component](https://github.com/component/component)
