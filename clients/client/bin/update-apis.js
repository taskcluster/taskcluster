#!/usr/bin/env node
let fs = require('fs');
let path = require('path');
let request = require('superagent');
let cliff = require('cliff');
let program = require('commander');
let _ = require('lodash');
let Promise = require('promise');
let stringify = require('json-stable-stringify');

// Markers for start and end of documentation section
let DOCS_START_MARKER = '<!-- START OF GENERATED DOCS -->';
let DOCS_END_MARKER = '<!-- END OF GENERATED DOCS -->';

// Load apis
let apis = require('../src/apis');

/** Save APIs to apis.js */
let saveApis = function() {
  // Path to apis.js file
  let apis_js = path.join(__dirname, '../src', 'apis.js');
  // Create content
  // Use json-stable-stringify rather than JSON.stringify to guarantee
  // consistent ordering (see http://bugzil.la/1200519)
  let content = '/* eslint-disable */\nmodule.exports = ' + stringify(apis, {
    space: '  ',
  }) + ';';
  fs.writeFileSync(apis_js, content, {encoding: 'utf-8'});
};

/** Find instance name by making first character lower-case */
let instanceName = function(name) {
  return name[0].toLowerCase() + name.substr(1);
};

/** Update documentation */
let updateDocs = function() {
  // Start docs section with DOCS_START_MARKER
  let docs = [
    DOCS_START_MARKER,
  ];

  // Generate documentation for methods
  // Sort by api name: http://bugzil.la/1200519
  docs = docs.concat(_.keys(apis).sort().filter(function(name) {
    // Find component that hold functions
    return apis[name].reference.entries.some(function(entry) {
      return entry.type === 'function';
    });
  }).map(function(name) {
    let api = apis[name];
    return [
      '',
      '### Methods in `taskcluster.' + name + '`',
      '```js',
      '// Create ' + name + ' client instance:',
      '//  - ' + api.reference.baseUrl,
      'var ' + instanceName(name) + ' = new taskcluster.' + name + '(options);',
      '```',
    ].concat(api.reference.entries.filter(function(entry) {
      return entry.type === 'function';
    }).map(function(entry) {
      let args = entry.args.slice();
      if (entry.input) {
        args.push('payload');
      }
      if ((entry.query || []).length > 0) {
        args.push('[options]');
      }
      let retval = 'void';
      if (entry.output) {
        retval = 'result';
      }
      return ' * `' + instanceName(name) + '.' + entry.name +
             '(' + args.join(', ') + ') : ' + retval + '`';
    })).join('\n');
  }));

  // Generate documentation for exchanges
  // Sort by exchange name: http://bugzil.la/1200519
  docs = docs.concat(_.keys(apis).sort().filter(function(name) {
    // Find component that hold functions
    return apis[name].reference.entries.some(function(entry) {
      return entry.type === 'topic-exchange';
    });
  }).map(function(name) {
    let api = apis[name];
    return [
      '',
      '### Exchanges in `taskcluster.' + name + '`',
      '```js',
      '// Create ' + name + ' client instance:',
      '//  - ' + api.reference.exchangePrefix,
      'var ' + instanceName(name) + ' = new taskcluster.' + name + '(options);',
      '```',
    ].concat(api.reference.entries.filter(function(entry) {
      return entry.type === 'topic-exchange';
    }).map(function(entry) {
      return ' * `' + instanceName(name) + '.' + entry.name +
             '(routingKeyPattern) : binding-info`';
    })).join('\n');
  }));

  // End the docs section with DOCS_END_MARKER
  docs = docs.concat([
    '',
    DOCS_END_MARKER,
  ]).join('\n');

  // Load README.md
  let readmePath = path.join(__dirname, '..', 'README.md');
  let readme = fs.readFileSync(readmePath, {encoding: 'utf-8'});

  // Split out docs and get text before and after docs, and write to readmeMD
  let before = readme.split(DOCS_START_MARKER)[0];
  let after = readme.split(DOCS_END_MARKER)[1];
  fs.writeFileSync(readmePath, before + docs + after, {encoding: 'utf-8'});
};

program
  .command('list')
  .description('List API references and names stored')
  .action(function() {
    let rows = [
      ['Name', 'referenceUrl'],
    ].concat(_.keys(apis).map(function(name) {
      return [name, apis[name].referenceUrl];
    }));
    console.log(cliff.stringifyRows(rows));
  });

program
  .command('show <name>')
  .description('Show references for a specific API')
  .action(function(name, options) {
    let api = apis[name];
    if (api === undefined) {
      console.log('No API named: ' + name);
      process.exit(1);
    }
    console.log(cliff.inspect(api));
  });

program
  .command('update')
  .description('Update all API references')
  .action(function() {
    // Fetch the Reference Manifest
    let manifestUrl = 'http://references.taskcluster.net/manifest.json';
    console.log('Fetching manifest reference from %s', manifestUrl);
    let p = request.get(manifestUrl);

    p = p.then(function(res) {
      let manifest = res.body;
      return manifest;
    });

    p = p.then(function(manifest) {
      apis = {};
      return Promise.all(Object.keys(manifest).map(function(name) {
        console.log('Fetching %s reference', name);
        return request.get(manifest[name]).then(function(res) {
          console.log('Updated ' + name);
          apis[name] = {
            referenceUrl: manifest[name],
            reference: res.body,
          };
        });
      }));
    });

    p = p.then(function() {
      updateDocs();
      saveApis();
    });

    p.catch(function(err) {
      console.log('Failed to update apis.js' + err.stack);
      process.exit(1);
    });
  });

program
  .command('remove <name>')
  .description('Remove API with a name')
  .action(function(name, options) {
    if (apis[name] === undefined) {
      console.log('No API named: ' + name);
      process.exit(1);
    }
    delete apis[name];
    updateDocs();
    saveApis();
    console.log('Removed: ' + name);
  });

program
  .command('docs')
  .description('Generate documentation in README.md')
  .action(function() {
    updateDocs();
  });

// Show help on unknown action
program.on('*', function() {
  program.outputHelp();
});

program
  .version(require('../package.json').version)
  .parse(process.argv);

// Show help if no action
if (program.args.length < 1) {
  program.outputHelp();
}
