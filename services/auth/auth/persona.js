var cookieParser    = require('cookie-parser');
var cookieSession   = require('cookie-session');
var _               = require('lodash');
var Promise         = require('promise');
var debug           = require('debug')("auth:persona");
var assert          = require('assert');
var moment          = require('moment');
var marked          = require('marked');
var passport        = require('passport');
var PassportPersona = require('passport-persona');
var express         = require('express')
var bodyParser      = require('body-parser');
var querystring     = require('querystring');
var taskcluster = require('taskcluster-client');
var url         = require('url');

/** Index page (the only page we have) */
var renderIndex = function(authFailed, req, res) {
  // Load client so we can sign
  var Client = req.app.globals.Client;
  Client.load(req.app.globals.clientIdForTempCreds).then(function(client) {
    return taskcluster.createTemporaryCredentials({
      start:        new Date(),
      expiry:       new Date(new Date().getTime() + 31 * 24 * 60 * 60 * 1000),
      scopes:       client.scopes,
      credentials:  {
        clientId:     client.clientId,
        accessToken:  client.accessToken
      }
    });
  }, function(err) {
    debug("Error loading client: %s, as JSON: %j", err, err, err.stack);
    return {
      clientId:     '',
      accessToken:  '',
      certificate:  'Internal server error'
    };
  }).then(function(credentials) {
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
      querystring:  querystring.stringify(req.query),
      authFailed:   authFailed
    });
  });
};

/** Setup the application for hosting the index page */
var setup = function(app, options) {
  assert(options.cookieSecret,    "cookieSecret is required");
  assert(options.viewFolder,      "viewFolder is required");
  assert(options.assetFolder,     "assetFolder is required");

  app.set('views', options.viewFolder);
  app.set('view engine', 'jade');
  app.locals.moment = moment;
  app.locals.marked = marked;

  app.use(bodyParser.urlencoded({extended: false}));
  app.use(cookieParser(options.cookieSecret));
  app.use(cookieSession({secret: options.cookieSecret}));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(function(req, res, next) {
    // Expose user to all templates, if logged in
    res.locals.user = req.user;
    next();
  });
  app.use('/assets', express.static(options.assetFolder));

  // Warn if no secret was used in production
  if ('production' == app.get('env')) {
    var secret = options.cookieSecret;
    if (secret == "Warn, if no secret is used on production") {
      console.log("Warning: Customized cookie secret should be used in " +
                  "production");
    }
  }

  // Passport configuration
  passport.use(new PassportPersona.Strategy({
      audience:   options.publicUrl
    }, function(email, done) {
    debug("Signed in with:" + email);
    if (/@mozilla\.com$/.test(email)) {
      done(null, {email: email});
    } else {
      done(null, null);
    }
  }));

  // Serialize user to signed cookie
  passport.serializeUser(function(user, done) {
    done(null, user.email);
  });

  // Deserialize user from signed cookie
  passport.deserializeUser(function(email, done) {
    done(null, {email: email});
  });

  // Facilitate persona login
  app.post('/', function(req, res, next) {
    passport.authenticate('persona', function(err, user, info) {
      if (user) {
        // Make sure we preserve the querystring
        req.logIn(user, function() {
          res.redirect('/?' + querystring.stringify(req.query));
        });
      } else {
        renderIndex(true, req, res);
      }
    })(req, res, next);
  });

  // Provide end-point to log out the user
  app.get('/logout', function(req, res){
    req.logout();
    // Make sure we preserve the querystring
    res.redirect('/?' + querystring.stringify(req.query));
  });

  // render index page
  app.get('/', function(req, res) {
    renderIndex(false, req, res);
  });
};

// Export setup
exports.setup = setup;