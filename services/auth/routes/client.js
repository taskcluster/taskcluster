var Promise     = require('promise');
var debug       = require('debug')('taskcluster-auth;routes:user');
var slugid      = require('slugid');

// Auxiliary function to handle errors
var errorHandler = function(res, title) {
  return function(error) {
    var iid = slugid.v4();
    debug("Error for incident id: %s, as JSON: %j",
          iid, error, error, error.stack);
    res.render('error', {
      title:            title,
      message:          "Ask administrator to lookup incident ID: " + iid
    });
  };
};

/** List all registered clients */
exports.list = function(req, res) {
  var Client = req.app.globals.Client;
  Client.loadAll().then(function(clients) {
    res.render('client-list', {
      title:          "Registered Clients",
      clients:        clients
    });
  }).catch(errorHandler(res, "Failed to load clients"));
};

/** Show form to create new client */
exports.create = function(req, res) {
  // Set default expiration to 1000 years...
  var expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1000, 0, 0);
  res.render('client-edit', {
    title:          "Create New Client",
    client: {
      name:         "My new client",
      clientId:     '[generated at creation]',
      accessToken:  '[generated at creation]',
      scopes:       [],
      expires:      expires,
      details: {
        notes:      "Describe what this use is for..."
      }
    },
    action:         'create'
  });
};

/** View existing client */
exports.view = function(req, res, next) {
  var Client = req.app.globals.Client;
  Client.load(req.params.clientId).then(function(client) {
    res.render('client-view', {
      title:          "Client " + client.name,
      client:         client
    });
  }, function() {
    // Return 404
    next();
  }).catch(errorHandler(res, "Error showing client"));
};

/** Edit existing client */
exports.edit = function(req, res) {
  var Client = req.app.globals.Client;
  Client.load(req.params.clientId).then(function(client) {
    res.render('client-edit', {
      title:          "Edit: " + client.name,
      client:         client,
      action:         'update'
    });
  }, function() {
    // Return 404
    next();
  }).catch(errorHandler(res, "Error editing client"));
};

/** Delete existing client */
exports.delete = function(req, res) {
  var Client = req.app.globals.Client;
  Client.load(req.params.clientId).then(function(client) {
    return client.remove();
  }, function() {
    // Return 404
    next();
  }).then(function() {
    res.redirect(302, '/client/');
  }).catch(errorHandler(res, "Error showing client"));
};

/** Update/create client and redirect to view */
exports.update = function(req, res) {
  debug("Create/update client: %j", req.body);
  var Client = req.app.globals.Client;
  Promise.from(null).then(function() {
    // Create client if requested
    if (req.body.updateOrCreate == 'create') {
      return Client.create({
        version:        '0.2.0',
        name:           req.body.name,
        clientId:       slugid.v4(),
        accessToken:    slugid.v4() + slugid.v4() + slugid.v4(),
        scopes:         JSON.parse(req.body.scopes),
        expires:        new Date(req.body.expires),
        details: {
          notes:        req.body.notes
        }
      });
    }

    // Update WorkerType if requested
    if (req.body.updateOrCreate == 'update') {
      return Client.load(req.body.clientId).then(function(client) {
        return client.modify(function() {
          this.name         = req.body.name;
          this.scopes       = JSON.parse(req.body.scopes);
          this.expires      = new Date(req.body.expires);
          this.details      = {notes: req.body.notes};
        });
      });
    }
  }).then(function(client) {
    res.redirect(302, '/client/' + client.clientId + '/view');
  }).catch(errorHandler(res, "Error saving client"));
};
