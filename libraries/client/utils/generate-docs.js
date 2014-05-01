#!/usr/bin/env node
var fs          = require('fs');
var path        = require('path');
var request     = require('superagent-promise');
var _           = require('lodash');

// Default API version to load
var DEFAULT_VERSION = 1;

// Path to apis.json file
var apis_json   = path.join(__dirname, '..', 'apis.json');

// Path to readme.md
var readme_md   = path.join(__dirname, '..', 'README.md');

/** Load APIs from apis.json */
var loadApis = function() {
  return JSON.parse(fs.readFileSync(apis_json, {encoding: 'utf-8'}));
};

/** Save APIs to apis.json */
var saveApis = function(apis) {
  fs.writeFileSync(apis_json, JSON.stringify(apis), {encoding: 'utf-8'});
};

// Markers for start and end of documentation section
var DOCS_START_MARKER = '<!-- START OF GENERATED DOCS -->';
var DOCS_END_MARKER   = '<!-- END OF GENERATED DOCS -->';

var apis = loadApis();

var docs = [
  DOCS_START_MARKER
].concat(_.keys(apis).map(function(name) {
  var api = apis[name];
  return [
    "",
    "### Methods in `client." + name + "`"
  ].concat(api.reference.filter(function(entry) {
    return entry.name != null;
  }).map(function(entry) {
    var args = (entry.route.match(/\/:[^/]+/g) || []).map(function(arg) {
      return arg.substr(2);
    });
    if (entry.requestSchema != undefined) {
      args.push('payload');
    }
    return " * `" + entry.name + "(" + args.join(', ') + ")`"
  })).join('\n');
}).concat([
  "",
  DOCS_END_MARKER
])).join('\n')

// Load readme
var readme = fs.readFileSync(readme_md, {encoding: 'utf-8'});

// Split out docs and get text before and after docs
var before = readme.split(DOCS_START_MARKER)[0]
var after = readme.split(DOCS_END_MARKER)[1];

fs.writeFileSync(readme_md, before + docs + after, {encoding: 'utf-8'});
