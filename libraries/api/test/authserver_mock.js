var express = require('express');
var base    = require('../');

var app = express();

var api = base.api({
  title:  "Authentication Mock Server",
  desc:   "Server that simulates an instance of the taskcluster\n" +
          "authentication server"
});

/** Create interface for returning a response */
api.declare({
  method:     'get',
  route:      '/client/:clientId/credentials',
  name:       'getCredentials',
  scopes:     ['auth:credentials'],
  title:      "Get Credentials",
  desc:       "Get credentials... mock..."
}, function(req, res) {
  if (req.params.clientId == "test-client") {
    res.json(200, {
      clientId:     "test-client",
      accessToken:  "test-token",
      scopes:       ['auth:*'],
      expires:      new Date(2092, 0, 0, 0, 0, 0, 0)
    });
  } else {
    res.json(404, {error: "ClientId not found"});
  }
});

api.router({
  validator:
})

var loadedValidator = base.validator({
  publish: false,

});

var server = app.listen(1201, function() {
  console.log('Listening on port %d', server.address().port);
});



