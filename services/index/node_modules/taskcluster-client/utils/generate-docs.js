#!/usr/bin/env node
var fs          = require('fs');
var path        = require('path');
var request     = require('superagent-promise');
var _           = require('lodash');

// Path to readme.md
var readme_md   = path.join(__dirname, '..', 'README.md');

// Markers for start and end of documentation section
var DOCS_START_MARKER = '<!-- START OF GENERATED DOCS -->';
var DOCS_END_MARKER   = '<!-- END OF GENERATED DOCS -->';

/** Find instance name by making first character lower-case */
var instanceName = function(name) {
  return name[0].toLowerCase() + name.substr(1);
};

// Load APIs
var apis = require('../apis');;

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


docs = docs.concat([
  "",
  DOCS_END_MARKER
]).join('\n');

// Load readme
var readme = fs.readFileSync(readme_md, {encoding: 'utf-8'});

// Split out docs and get text before and after docs
var before = readme.split(DOCS_START_MARKER)[0]
var after = readme.split(DOCS_END_MARKER)[1];

fs.writeFileSync(readme_md, before + docs + after, {encoding: 'utf-8'});
