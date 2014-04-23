/**
@fileoverview

Utilities for converting github pull requests to resultsets.

@module mozilla-treeherder/github
*/
var assert = require('assert');
var factory = require('./factory/github');

var Promise = require('promise');

/*
@param {String} repository for pull request result in treeherder.
@param {Object} options to configure pull request -> resultset.
@param {Object} options.github object from the `github` module.
@param {String} options.repo repository of the github project.
@param {String} options.user user/org which owns the repository.
@param {String} options.number of the pull request to generate results for.
*/
function pull(repository, options) {
  assert(options.github, 'github instance is required');
  assert(options.repo, 'github repo is required');
  assert(options.user, 'github user is required');
  assert(options.number, 'github number is required');

  // github api glue
  var gh = options.github;
  var pr = gh.pullRequests;
  var prGet = Promise.denodeify(pr.get.bind(pr));
  var prCommits = Promise.denodeify(pr.getCommits.bind(pr));

  // treeherder results
  var resulset;

  return prGet({
    user: options.user,
    repo: options.repo,
    number: options.number
  }).then(function(prResult) {
    resulset = factory.pull(repository, prResult);
    return prCommits({
      user: options.user,
      repo: options.repo,
      number: options.number
    });
  }).then(function(commits) {
    resulset.revisions = factory.pullCommits(repository, commits);
    return resulset;
  });
}

module.exports.pull = pull;
