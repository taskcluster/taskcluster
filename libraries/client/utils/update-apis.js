#!/usr/bin/env node
var fs          = require('fs');
var path        = require('path');
var request     = require('superagent-promise');
var cliff       = require('cliff');
var program     = require('commander');
var _           = require('lodash');
var Promise     = require('promise');

// Path to apis.json file
var apis_json   = path.join(__dirname, '..', 'apis.json');

/** Load APIs from apis.json */
var loadApis = function() {
  return JSON.parse(fs.readFileSync(apis_json, {encoding: 'utf-8'}));
};

/** Save APIs to apis.json */
var saveApis = function(apis) {
  fs.writeFileSync(apis_json, JSON.stringify(apis, null, 2), {encoding: 'utf-8'});
};

program
  .command('list')
  .description("List API references and names stored")
  .action(function() {
    var apis = loadApis();
    var rows = [
      ['Name', 'referenceUrl']
    ].concat(_.keys(apis).map(function(name) {
      return [name, apis[name].referenceUrl];
    }));
    console.log(cliff.stringifyRows(rows));
  });

program
  .command('show <name>')
  .description("Show references for a specific API")
  .action(function(name, options) {
    var apis  = loadApis();
    var api   = apis[name];
    if (api === undefined) {
      console.log("No API named: " + name);
      process.exit(1);
    }
    console.log(cliff.inspect(api));
  });

program
  .command('add <name> <reference-url>')
  .option(
    '-f, --force',
    "Overwrite existing API entry with same name"
  )
  .description("Add API reference with <name> with <referenceUrl>")
  .action(function(name, referenceUrl, options) {
    var apis = loadApis();
    // Check that we don't overwrite unless there is a force
    if (apis[name] !== undefined && !options.force) {
      console.log("API named: " + name + " already exists");
      console.log("Use --force to overwrite it");
      process.exit(1);
    }

    // Load reference from referenceUrl
    console.log("Fetching reference from: " + referenceUrl);
    var loaded_reference = request.get(referenceUrl).end().then(function(res) {
      if (!res.ok) {
        console.log("Failed to fetch reference from: " + referenceUrl)
        console.log("Error: " + res.text);
        process.exit(2);
      }
      return res.body;
    });

    // Save reference when loaded
    loaded_reference.then(function(reference) {
      apis[name] = {
        referenceUrl: referenceUrl,
        reference:    reference
      };
      saveApis(apis);
      console.log("Add reference: " + name);
    }).catch(function(err) {
      console.log("Error adding reference: " + err);
    });
  });

program
  .command('update')
  .description("Update all API references")
  .action(function() {
    var apis = loadApis();

    // Update remaining references
    Promise.all(Object.keys(apis).map(function(name) {
      var api = apis[name];
      // Load reference from referenceUrl
      console.log("Fetching reference from: " + api.referenceUrl);

      return request.get(api.referenceUrl).end().
        then(function(res) {
          if (!res.ok) {
            console.log("Failed to fetch reference from: " + api.referenceUrl);
            console.log("Error: " + res.text);
            process.exit(2);
          }
          if (_.isEqual(api.reference, res.body)) {
            console.log("No changes from: " + api.referenceUrl);
          } else {
            console.log("Received changes from: " + api.referenceUrl);
          }
          api.reference = res.body;
        });
    })).then(function() {
      saveApis(apis);
    });
  });

program
  .command('remove <name>')
  .description('Remove API with a name')
  .action(function(name, options) {
    var apis = loadApis();
    if (apis[name] === undefined) {
      console.log("No API named: " + name);
      process.exit(1);
    }
    delete apis[name];
    saveApis(apis);
    console.log("Removed: " + name);
  });

// Show help on unknown action
program.on('*', function() {
  program.outputHelp();
});

program
  .version(require('../package.json').version)
  .parse(process.argv);

// Show help if no action
if (program.args.length < 1 ) {
  program.outputHelp();
}
