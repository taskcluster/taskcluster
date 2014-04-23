#!/usr/bin/env node
var fs          = require('fs');
var path        = require('path');
var request     = require('superagent-promise');
var cliff       = require('cliff');
var program     = require('commander');
var _           = require('lodash');

// Default API version to load
var DEFAULT_VERSION = 1;

// Path to apis.json file
var apis_json   = path.join(__dirname, '..', 'apis.json');

/** Load APIs from apis.json */
var loadApis = function() {
  return JSON.parse(fs.readFileSync(apis_json, {encoding: 'utf-8'}));
};

/** Save APIs to apis.json */
var saveApis = function(apis) {
  fs.writeFileSync(apis_json, JSON.stringify(apis), {encoding: 'utf-8'});
};

// Track if an action is running
var ran_action = false;

program
  .command('list')
  .description("List API references and names stored")
  .action(function() {
    ran_action = true;
    var apis = loadApis();
    var rows = [
      ['Name', 'baseUrl']
    ].concat(_.keys(apis).map(function(name) {
      return [name, apis[name].baseUrl];
    }));
    console.log(cliff.stringifyRows(rows));
  });

program
  .command('show <name>')
  .description("Show references for a specific API")
  .action(function(name, options) {
    ran_action = true;
    var apis  = loadApis();
    var api   = apis[name];
    if (api === undefined) {
      console.log("No API named: " + name);
      process.exit(1);
    }
    console.log(cliff.inspect(api));
  });

program
  .command('add <name> <baseUrl>')
  .option(
    '-v, --api-version [version]',
    "API version to load",
    DEFAULT_VERSION
  )
  .option(
    '-f, --force',
    "Overwrite existing API entry with same name"
  )
  .option(
    '-r, --reference [file]',
    "Reference to load from file, if not loaded from <baseUrl>"
  )
  .description("Add API reference with <name> with <baseUrl>")
  .action(function(name, baseUrl, options) {
    ran_action = true;
    var apis = loadApis();
    // Check that we don't overwrite unless there is a force
    if (apis[name] !== undefined && !options.force) {
      console.log("API named: " + name + " already exists");
      console.log("Use --force to overwrite it");
      process.exit(1);
    }

    // Load reference
    var loaded_reference = null;
    if (options.reference) {
      // Load reference from file
      loaded_reference = new Promise(function(accept, reject) {
        var data = fs.readFileSync(options.reference, {encoding: 'utf-8'});
        accept(JSON.parse(data));
      });
    } else {
      // Load reference using baseUrl and version
      var url = baseUrl + '/v' + options.apiVersion + '/reference';
      console.log("Fetching reference from: " + url);
      loaded_reference = request.get(url).end().then(function(res) {
        if (!res.ok) {
          console.log("Failed to fetch reference from: " + baseUrl)
          console.log("Error: " + res.text);
          process.exit(2);
        }
        return res.body;
      });
    }

    // Save reference when loaded
    loaded_reference.then(function(reference) {
      apis[name] = {
        baseUrl:      baseUrl,
        reference:    reference,
        autoUpdate:   (options.reference == undefined),
        version:      options.apiVersion
      };
      saveApis(apis);
      console.log("Add reference: " + name);
    }).catch(function(err) {
      console.log("Error adding reference: " + err);
    });
  });

program
  .command('update')
  .description("Update all auto-updatable API references")
  .action(function() {
    ran_action = true;
    var apis = loadApis();

    // Print APIs that can't be auto-updated
    _.keys(apis).filter(function(name) {
      return !apis[name].autoUpdate;
    }).forEach(function(name) {
      console.log("Cannot auto-update: " + name);
    });

    // Update remaining references
    _.keys(apis).filter(function(name) {
      return apis[name].autoUpdate;
    }).map(function(name) {
      var api = apis[name];
      // Load reference using baseUrl and version
      var url = api.baseUrl + '/v' + api.version + '/reference';
      console.log("Fetching reference from: " + url);
      loaded_reference = request.get(url).end().then(function(res) {
        if (!res.ok) {
          console.log("Failed to fetch reference from: " + baseUrl)
          console.log("Error: " + res.text);
          process.exit(2);
        }
        console.log("Updated: " + name);
        api.reference = res.body;
      });
    });
  });

program
  .command('remove <name>')
  .description('Remove API with a name')
  .action(function(name, options) {
    ran_action = true;
    var apis = loadApis();
    if (apis[name] === undefined) {
      console.log("No API named: " + name);
      process.exit(1);
    }
    delete apis[name];
    console.log("Removed: " + name);
  });

program
  .version(require('../package.json').version)
  .parse(process.argv);

if (!ran_action) {
  program.outputHelp();
}
