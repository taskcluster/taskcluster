var express         = require('express');
var bodyParser      = require('body-parser');
var morgan          = require('morgan');
var methodOverride  = require('method-override');
var cookieParser    = require('cookie-parser');
var cookieSession   = require('cookie-session');
var errorHandler    = require('errorhandler');
var passport        = require('passport');
var _               = require('lodash');
var debug           = require('debug')("base:app");
var assert          = require('assert');
var moment          = require('moment');
var marked          = require('marked');
var Promise         = require('promise');
var http            = require('http');
var PassportPersona = require('passport-persona');
var sslify          = require('express-sslify');

/**
 * Setup Middleware for normal browser consumable HTTP end-points.
 *
 * options:
 * {
 *   cookieSecret:  "..."                          // Cookie signing secret
 *   viewFolder:    path.join(__dirnmae, 'views')  // Folder with templates
 *   assetFolder:   path.join(__dirname, 'assets') // Folder with static files
 *   publicUrl:     'http://domain.com'            // Public URL for persona
 *   personaLogin:         '/persona-auth'    // Login URL
 *   personaLogout:        '/logout'          // Logout URL
 *   personaUnauthorized:  '/unauthorized'    // Unauthorized URL
 * }
 *
 * Returns a middleware utility that ensures authentication as administrator.
 */
var setup = function(options) {
  var app = this;
  assert(options.cookieSecret,    "cookieSecret is required");
  assert(options.viewFolder,      "viewFolder is required");
  assert(options.assetFolder,     "assetFolder is required");

  // Set default options
  _.defaults(options, {
    personaLogin:         '/persona-auth',
    personaLogout:        '/logout',
    personaUnauthorized:  '/unauthorized'
  });

  app.set('views', options.viewFolder);
  app.set('view engine', 'jade');
  app.locals.moment = moment;
  app.locals.marked = marked;

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended: true}));
  app.use(methodOverride());
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

  // Middleware for development
  if (app.get('env') == 'development') {
    app.use(errorHandler());
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
  app.post(options.personaLogin, passport.authenticate('persona', {
      failureRedirect:        options.personaUnauthorized
    }), function(req, res) {
    res.redirect('/');
  });

  // Provide end-point to log out the user
  app.get(options.personaLogout, function(req, res){
    req.logout();
    res.redirect('/');
  });

  // Middleware utility for requiring authentication
  var ensureAuth = function(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    res.redirect(options.personaUnauthorized);
  };

  return ensureAuth;
};

/** Notify LocalApp if running under this */
var notifyLocalAppInParentProcess = function(port) {
  // If there is a parent process post a message to notify it that the app is
  // ready and running on specified port. This is useful for automated
  // testing and hopefully won't cause pain anywhere else.
  if(process.send) {
    process.send({
      ready:  true,
      port:   port,
      appId:  process.env.LOCAL_APP_IDENTIFIER
    });
  }
};

/** Create server from app */
var createServer = function() {
  var app = this;
  return new Promise(function(accept, reject) {
    // Launch HTTP server
    var server = http.createServer(app);

    // Add a little method to help kill the server
    server.terminate = function() {
      return new Promise(function(accept, reject) {
        server.close(function() {
          accept();
        });
      });
    };

    // Handle errors
    server.once('error', reject);

    // Listen
    server.listen(app.get('port'), function() {
      debug('Server listening on port ' + app.get('port'));
      accept(server);
    });
  }).then(function(server) {
    notifyLocalAppInParentProcess(app.get('port'));
    return server;
  });
};

/** Create express application
 * options:
 * {
 *   port:          8080,           // Port to run the server on
 *   env:           'development',  // 'development' or 'production'
 *   forceSSL:      false,          // Force redirect to SSL or return 403
 *   trustProxy:    false           // Trust the proxy that forwarded for SSL
 * }
 *
 * Returns an express application with extra methods:
 *   - `setup`          (Configures middleware for HTML UI and persona login)
 *   - `createServer`   (Creates an server)
 */
var app = function(options) {
  assert(options,                           "options are required");
  assert(typeof(options.port) === 'number', "Port must be a number");
  assert(options.env == 'development' ||
         options.env == 'production',       "env must be prod... or dev...");
  assert(options.forceSSL !== undefined,    "forceSSL must be defined");
  assert(options.trustProxy !== undefined,  "trustProxy must be defined");

  // Create application
  var app = express();
  app.set('port', options.port);
  app.set('env', options.env);
  app.set('json spaces', 2);

  // ForceSSL if required suggested
  if (options.forceSSL) {
    app.use(sslify.HTTPS(options.trustProxy));
  }

  // Middleware for development
  if (app.get('env') == 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('tiny'))
  }

  // Add some auxiliary methods to the app
  app.setup           = setup;
  app.createServer    = createServer;

  return app;
};

// Export app creation utility
module.exports = app;

// Export notifyLocalAppInParentProcess for non-app processes to use
app.notifyLocalAppInParentProcess = notifyLocalAppInParentProcess;