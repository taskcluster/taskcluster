suite("app", function() {
  var assert  = require('assert');
  var path    = require('path');
  var base    = require('../');
  var request = require('superagent-promise');

  // Test app creation
  test("app({port: 1459})", function() {
    // Create a simple app
    var app = base.app({
      port:       1459,
      env:        'development',
      forceSSL:   false,
      trustProxy: false
    });
    assert(app, "Should have an app");

    // Add an end-point
    app.get("/test", function(req, res) {
      res.status(200).send("Okay this works");
    });

    // Create server
    var server = null;
    return app.createServer().then(function(server_) {
      server = server_;
      return request.get('http://localhost:1459/test').end();
    }).then(function(res) {
      assert(res.ok, "Got response");
      assert(res.text == "Okay this works", "Got the right text");
      return server.terminate();
    });
  });

  // Test setup and see if we can get assets
  test("setup() - GET assets/", function() {
    // Create a simple app
    var app = base.app({
      port:       1459,
      env:        'development',
      forceSSL:   false,
      trustProxy: false
    });
    assert(app, "Should have an app");

    // Setup application
    app.setup({
      cookieSecret:     "Not really secret",
      viewFolder:       path.join(__dirname, 'views'),
      assetFolder:      path.join(__dirname, 'assets'),
      development:      true,
      publicUrl:        'http://localhost:1459'
    });

    // Add an end-point
    app.get("/test", function(req, res) {
      res.status(200).send("Okay this works");
    });

    // Create server
    var server = null;
    return app.createServer().then(function(server_) {
      server = server_;
      return request.get('http://localhost:1459/test').end();
    }).then(function(res) {
      assert(res.ok, "Failed to get response");
      assert(res.text == "Okay this works", "Got the right text");

      return request.get('http://localhost:1459/assets/test.txt').end();
    }).then(function(res) {
      assert(res.ok, "Failed to get asset");
      assert(res.text == "My test asset\n", "Got the right asset");

      return server.terminate();
    });
  });

  // Test setup and see if we can render a template
  test("setup() - render view", function() {
    // Create a simple app
    var app = base.app({
      port:       1459,
      env:        'development',
      forceSSL:   false,
      trustProxy: false
    });
    assert(app, "Should have an app");

    // Setup application
    app.setup({
      cookieSecret:     "Not really secret",
      viewFolder:       path.join(__dirname, 'views'),
      assetFolder:      path.join(__dirname, 'assets'),
      development:      true,
      publicUrl:        'http://localhost:1459'
    });

    // Add an end-point
    app.get("/test", function(req, res) {
      res.render("test-view", {key: "43pfij39j3p98tr49"});
    });

    // Create server
    var server = null;
    return app.createServer().then(function(server_) {
      server = server_;
      return request.get('http://localhost:1459/test').end();
    }).then(function(res) {
      assert(res.ok, "Failed to get response");
      assert(res.text.indexOf('43pfij39j3p98tr49') !== -1,
             "Value wasn't substituted into template");

      return server.terminate();
    });
  });

  //TODO: Make tests for unauthorized redirects work... For some reason
  //      superagent doesn't like the redirects. It basically drops the promise
  //      and the test times out.
  /*
  // Test setup and see if reject authentication
  test("setup() - unauthorized", function() {
    // Create a simple app
    var app = base.app({
      port: 1459
    });
    assert(app, "Should have an app");

    // Add a handler for unauthorized access
    app.get('/unauthorized', function(req, res) {
      res.send(200, "Not authorized");
    });

    // Setup application
    var ensureAuth = app.setup({
      cookieSecret:     "Not really secret",
      viewFolder:       path.join(__dirname, 'views'),
      assetFolder:      path.join(__dirname, 'assets'),
      development:      true,
      publicUrl:        'http://localhost:1459'
    });

    // Add a protected end-point
    app.get('/protected', ensureAuth, function(req, res) {
      res.json(200, {message: "You are in"});
    });

    // Create server
    var server = null;
    return app.createServer().then(function(server_) {
      server = server_;
      return request.get('http://localhost:1459/protected').redirects(5).end();
    }).then(function(res) {
      assert(res.ok, "Got response");
      assert(res.text === "Not authorized", "Auth problem");
      return server.terminate();
    });
  });
  */
});

