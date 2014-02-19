// Dependencies
var express                         = require('express');
var http                            = require('http');
var path                            = require('path');
var nconf                           = require('nconf');
var passport                        = require('passport');
var Promise                         = require('promise');
var PersonaStrategy                 = require('passport-persona').Strategy;
var events                          = require('./queue/events');
var data                            = require('./queue/data');
var debug                           = require('debug')('server');

// Load configuration
var config  = require('./config');

// Load default_only if server.js has a parent, hence, is being imported
config.load(module.parent);

// Load a little monkey patching
require('./utils/spread-promise').patch();
require('./utils/aws-sdk-promise').patch();

// Create expressjs application
var app = exports.app = express();

// Middleware configuration
app.set('port', Number(nconf.get('server:port')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
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
app.use('/static', require('stylus').middleware(path.join(__dirname, 'static')));
app.use('/static', express.static(path.join(__dirname, 'static')));

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
app.get('/',                                                      routes.index);
app.get('/unauthorized',                                          routes.unauthorized);

/** Launch the server */
exports.launch = function() {
  debug("Launching server");

  if ('development' == app.get('env')) {
    debug("Launching in development-mode");
  }

  // Setup amqp exchanges and connection
  return events.setup().then(function() {
    return data.setupDatabase();
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
  exports.launch();
}
