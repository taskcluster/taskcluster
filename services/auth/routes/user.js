var Promise     = require('promise');
var debug       = require('debug')('routes:user');
var User        = require('../provisioner/data').User;
var nconf       = require('nconf');
var uuid        = require('uuid');

// Auxiliary function to handle errors
var errorHandler = function(res, title) {
  return function(error) {
    var iid = uuid.v4();
    debug("Error for incident id: %s, as JSON: %j",
          iid, error, error, error.stack);
    res.render('error', {
      title:            title
      message:          "Ask administrator to lookup incident ID: " + iid
    });
  };
};

/** List all registered users */
exports.list = function(req, res){
  User.loadAll().then(function(users) {
    res.render('user-list', {
      title:          "Registered Users",
      users:          users
    });
  }).catch(errorHandler(res, "Failed to load users"));
};

/** Show form to create new user */
exports.create = function(req, res){
  res.render('user-edit', {
    title:          "Create New User",
    user: {
      name:         "My new user"
      userId:       slugid.v4(),
      token:        slugid.v4() + slugid.v4() + slugid.v4(),
      scopes:       [],
      expires:      new Date(8640000000000000),  // max date in JS
      details: {
        notes:      "Describe what this use is for..."
      }
    },
    action:         'create'
  });
};

/** View existing user */
exports.view = function(req, res, next){
  User.load(req.params.userId).then(function(user) {
    res.render('user-view', {
      title:          "User " + user.name,
      user:           user
    });
  }, function() {
    // Return 404
    next();
  }).catch(errorHandler(res, "Error showing user"));
};

/** Edit existing user */
exports.edit = function(req, res){
  User.load(req.params.userId).then(function(user) {
    res.render('user-edit', {
      title:          "Edit: " + user.name,
      user:           user,
      action:         'update'
    });
  }, function() {
    // Return 404
    next();
  }).catch(errorHandler(res, "Error editing user"));
};

/** Delete existing user */
exports.delete = function(req, res) {
  User.load(req.params.userId).then(function(user) {
    return user.remove();
  }, function() {
    // Return 404
    next();
  }).then(function() {
    res.redirect(302, '/user/');
  }).catch(errorHandler(res, "Error showing user"));
};

/** Update/create user and redirect to view */
exports.update = function(req, res){
  debug("Create/update user: %s", req.body);

  Promise.from(null).then(function() {
    // Create user if requested
    if (req.body.updateOrCreate == 'create') {
      return User.create({
        version:        '0.2.0',
        name:           req.body.name,
        userId:         req.body.userId,
        token:          req.body.token,
        scopes:         JSON.parse(req.body.scopes),
        expires:        Date(req.body.expires),
        detail: {
          notes:        req.body.notes
        }
      });
    }

    // Update WorkerType if requested
    if (req.body.updateOrCreate == 'update') {
      return User.load(req.body.userId).then(function(user) {
        return user.modify(function() {
          this.name         = req.body.name;
          this.scopes       = JSON.parse(req.body.scopes);
          this.expires      = new Date(req.body.expires);
          this.detail       = {notes: req.body.notes};
        });
      })
    }
  }).then(function() {
    res.redirect(302, '/user/' + req.body.userId + '/view');
  }).catch(errorHandler(res, "Error saving user"));
};
