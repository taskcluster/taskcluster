// Include all modules
[
  'unauthorized',
  'client'
].forEach(function(module) {
  exports[module] = require('./' + module);
});


var taskcluster = require('taskcluster-client');
var url         = require('url');
var querystring = require('querystring');

/*
 * GET home page.
 */

exports.index = function(req, res){
  credentials = taskcluster.createTemporaryCredentials({
    start:        new Date(),
    expiry:       new Date(new Date().getTime() + 31 * 24 * 60 * 60 * 1000),
    scopes:       ['*'],
    credentials:  req.app.globals.root
  });
  if (typeof(credentials.certificate) !== 'string') {
    credentials.certificate = JSON.stringify(credentials.certificate);
  }

  // Add temporary credentials to target URL
  var target = undefined;
  if (req.query.target) {
    target = url.parse(req.query.target);
    delete target.search;
    if (!target.query) {
      target.query = {};
    }
    target.query.clientId     = credentials.clientId;
    target.query.accessToken  = credentials.accessToken;
    target.query.certificate  = credentials.certificate;
  }

  // Render login page
  res.render('login', {
    query:        req.query,
    target:       url.format(target),
    credentials:  credentials,
    querystring:  querystring.stringify(req.query)
  });
};
