const _ = require('lodash');
const util = require('util');
const fs = require('fs');
const path = require('path');
const split = require('split');
const rimraf = util.promisify(require('rimraf'));
const git = require('simple-git/promise');
const doT = require('dot');
const {quote} = require('shell-quote');
const yaml = require('js-yaml');
const libDocs = require('taskcluster-lib-docs');
const {gitClone} = require('./utils');

const generateOtherTasks = ({tasks, baseDir, spec, cfg, name, cmdOptions}) => {
  // nothing to do here -- repo tasks take care of everything
  return [];
};

module.exports = generateOtherTasks;
