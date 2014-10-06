#!/usr/bin/env node
var fs          = require('fs');
var path        = require('path');
var request     = require('superagent-promise');
var cliff       = require('cliff');
var program     = require('commander');
var _           = require('lodash');
var Promise     = require('promise');
var browserify  = require('browserify');

// Markers for start and end of documentation section
var DOCS_START_MARKER = '<!-- START OF GENERATED DOCS -->';
var DOCS_END_MARKER   = '<!-- END OF GENERATED DOCS -->';

// Load apis
var apis        = require('../lib/apis');

/** Save APIs to apis.js */
var saveApis = function() {
  // Path to apis.js file
  var apis_js = path.join(__dirname, '../lib', 'apis.js');
  // Create content
  var content = "module.exports = " + JSON.stringify(apis, null, 2) + ";";
  fs.writeFileSync(apis_js, content, {encoding: 'utf-8'});
};

/** Find instance name by making first character lower-case */
var instanceName = function(name) {
  return name[0].toLowerCase() + name.substr(1);
};

/** Update documentation */
var updateDocs = function() {
  // Start docs section with DOCS_START_MARKER
  var docs = [
    DOCS_START_MARKER
  ];

  // Generate documentation for methods
  docs = docs.concat(_.keys(apis).filter(function(name) {
      // Find component that hold functions
      return apis[name].reference.entries.some(function(entry) {
        return entry.type === 'function';
      });
    }).map(function(name) {
    var api = apis[name];
    return [
      "",
      "### Methods in `taskcluster." + name + "`",
      "```js",
      "// Create " + name + " client instance with default baseUrl:",
      "//  - " + api.reference.baseUrl,
      "var " + instanceName(name) + " = new taskcluster." + name + "(options);",
      "```"
    ].concat(api.reference.entries.filter(function(entry) {
      return entry.type === 'function';
    }).map(function(entry) {
      var args = entry.args.slice();
      if (entry.input) {
        args.push('payload');
      }
      var retval = 'void';
      if (entry.output) {
        retval = 'result';
      }
      return " * `" + instanceName(name) + "." + entry.name +
             "(" + args.join(', ') + ") : " + retval + "`";
    })).join('\n');
  }));


  // Generate documentation for exchanges
  docs = docs.concat(_.keys(apis).filter(function(name) {
      // Find component that hold functions
      return apis[name].reference.entries.some(function(entry) {
        return entry.type === 'topic-exchange';
      });
    }).map(function(name) {
    var api = apis[name];
    return [
      "",
      "### Exchanges in `taskcluster." + name + "`",
      "```js",
      "// Create " + name + " client instance with default exchangePrefix:",
      "//  - " + api.reference.exchangePrefix,
      "var " + instanceName(name) + " = new taskcluster." + name + "(options);",
      "```"
    ].concat(api.reference.entries.filter(function(entry) {
      return entry.type === 'topic-exchange';
    }).map(function(entry) {
      return " * `" + instanceName(name) + "." + entry.name +
             "(routingKeyPattern) : binding-info`";
    })).join('\n');
  }));

  // End the docs section with DOCS_END_MARKER
  docs = docs.concat([
    "",
    DOCS_END_MARKER
  ]).join('\n');

  // Load README.md
  var readmePath  = path.join(__dirname, '..', 'README.md');
  var readme      = fs.readFileSync(readmePath, {encoding: 'utf-8'});

  // Split out docs and get text before and after docs, and write to readmeMD
  var before  = readme.split(DOCS_START_MARKER)[0]
  var after   = readme.split(DOCS_END_MARKER)[1];
  fs.writeFileSync(readmePath, before + docs + after, {encoding: 'utf-8'});
};

/** Create browserify module */
var browserifyModule = function() {
  var bundlePath = path.join(__dirname, '..', 'taskcluster-client.js');
  browserify({
    standalone: 'taskcluster'
  })
  .add(path.join(__dirname, '..', 'browser.js'))
  .bundle()
  .pipe(fs.createWriteStream(bundlePath));
};

program
  .command('list')
  .description("List API references and names stored")
  .action(function() {
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
      updateDocs();
      saveApis();
      browserifyModule();
      console.log("Add reference: " + name);
    }).catch(function(err) {
      console.log("Error adding reference: " + err);
    });
  });

program
  .command('update')
  .description("Update all API references")
  .action(function() {
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
      updateDocs();
      saveApis();
      browserifyModule();
    });
  });

program
  .command('remove <name>')
  .description('Remove API with a name')
  .action(function(name, options) {
    if (apis[name] === undefined) {
      console.log("No API named: " + name);
      process.exit(1);
    }
    delete apis[name];
    updateDocs();
    saveApis();
    browserifyModule();
    console.log("Removed: " + name);
  });

program
  .command('docs')
  .description('Generate documentation in README.md')
  .action(function() {
    updateDocs();
  });

program
  .command('browserify')
  .description('Generate browserify bundle for this module')
  .action(function() {
    browserifyModule();
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
