// Load configuration
var config  = require('./config');

// Load configuration
config.load();

// Dependencies
var express                         = require('express');
var http                            = require('http');
var path                            = require('path');
var nconf                           = require('nconf');
var passport                        = require('passport');
var Promise                         = require('promise');
var PersonaStrategy                 = require('passport-persona').Strategy;
var validate                        = require('./utils/validate');
var debug                           = require('debug')('server');

// Load a little monkey patching
require('./utils/spread-promise').patch();

// Create expressjs application
var app = exports.app = express();

// Middleware configuration
app.set('port', Number(process.env.PORT || nconf.get('server:port')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.locals.moment = require('moment');  // make moment available to jade
app.use(express.favicon());
app.use(express.logger('dev'));

// Mount API for version v1
require('./routes/api/v1').mount(app, '/v1');

app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(express.cookieParser(nconf.get('server:cookieSecret')));
app.use(express.session());
app.use(passport.initialize());
app.use(passport.session());
app.use(function(req, res, next) {
  // Expose user to all templates, if logged in
  res.locals.user = req.user;
  next();
});
app.use(app.router);
app.use('/assets', require('stylus').middleware(path.join(__dirname, 'assets')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Warn if no secret was used in production
if ('production' == app.get('env')) {
  var secret = nconf.get('server:cookieSecret');
  if (secret == "Warn, if no secret is used on production") {
    console.log("Warning: Customized cookie secret should be used in production");
  }
}

// Middleware for development
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

// Passport configuration
passport.use(new PersonaStrategy({
    audience: 'http://' + nconf.get('server:hostname') + ':' +
               nconf.get('server:port')
  },
  function(email, done) {
    debug("Signed in with:" + email);
    if (/@mozilla\.com$/.test(email)) {
      done(null, {email: email});
    } else {
      done(null, null);
    }
  }
));

// Serialize user to signed cookie
passport.serializeUser(function(user, done) {
  done(null, user.email);
});

// Deserialize user from signed cookie
passport.deserializeUser(function(email, done) {
  done(null, {email: email});
});

app.post('/persona-auth',
  passport.authenticate('persona', {failureRedirect: '/unauthorized'}),
  function(req, res) {
    res.redirect('/');
  }
);

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

/** Middleware for requiring authenticatoin */
var ensureAuthenticated = function(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/unauthorized');
}

// Route configuration
var routes = require('./routes');
app.get('/',                                    routes.index);
app.get('/unauthorized',                        routes.unauthorized);
// Route configuration
var routes = require('./routes');
app.get('/',                                              routes.index);
app.get('/unauthorized',                                  routes.unauthorized);
app.get('/user',                    ensureAuthenticated,  routes.user.list);
app.get('/user/create',             ensureAuthenticated,  routes.user.create);
app.get('/user/:userId/view',       ensureAuthenticated,  routes.user.view);
app.get('/user/:userId/edit',       ensureAuthenticated,  routes.user.edit);
app.get('/user/:userId/delete',     ensureAuthenticated,  routes.user.delete);
app.post('/user/update',            ensureAuthenticated,  routes.user.update)



/** Launch the server */
exports.launch = function() {
  debug("Launching server");

  if ('development' == app.get('env')) {
    debug("Launching in development-mode");
  }

  // Setup
  return validate.setup().then(function() {
    // Publish schemas if necessary
    if (nconf.get('auth:publishSchemas')) {
      return require('./utils/render-schema').publish();
    }
  }).then(function() {
    return new Promise(function(accept, reject) {
      // Launch HTTP server
      var server = http.createServer(app);

      // Add a little method to help kill the server
      server.terminate = function() {
        return new Promise(function(accept, reject) {
          server.close(function() {
            accept(Promise.all(events.disconnect(), data.disconnect()));
          });
        });
      };

      // Listen
      server.listen(app.get('port'), function(){
        debug('Express server listening on port ' + app.get('port'));
        accept(server);
      });
    });
  });
};

// If server.js is executed start the server
if (!module.parent) {
  exports.launch().then(function() {
    // If launched in development mode as a subprocess of node, then we'll
    // sending a message informing the parent process that we're now ready!
    if (app.get('env') == 'development' && process.send) {
      process.send({ready: true});
    }
    debug("Launch queue successfully");
  }).catch(function(err) {
    debug("Failed to start server, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the server we should crash
    process.exit(1);
  });
}
