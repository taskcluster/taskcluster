// Dependencies
var express                         = require('express');
var http                            = require('http');
var path                            = require('path');
var nconf                           = require('nconf');
var passport                        = require('passport');
var PersonaStrategy                 = require('passport-persona').Strategy;

// Load configuration
var config  = require('./config');

// Load default_only if server.js has a parent, hence, is being imported
config.load(module.parent);

// Load a little monkey patching
require('./utils/spread-promise').patch();

// Create expressjs application
var app = exports.app = express();

// Middleware configuration
app.set('port', nconf.get('server:port'));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(express.cookieParser(nconf.get('server:cookie-secret')));
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
  var secret = nconf.get('server:cookie-secret');
  if (secret == "Warn, if no secret is used on production") {
    console.log("Warning: Customized cookie secret should be used in production");
  }
}

// Middleware for development
if ('development' == app.get('env')) {
  console.log("Launched in development-mode");
  app.use(express.errorHandler());
}

// Passport configuration
passport.use(new PersonaStrategy({
    audience: 'http://' + nconf.get('server:hostname') + ':' +
               nconf.get('server:port')
  },
  function(email, done) {
    console.log("Signed in with:" + email);
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
app.get('/0.1.0/kill-instance/:instance',                         routes.api.kill);
app.get('/0.1.0/list-instances/:instance',                        routes.api.list);

/** Run the server */
exports.run = function() {
  // Launch HTTP server
  http.createServer(app).listen(app.get('port'), function(){
    console.log('Express server listening on port ' + app.get('port'));
  });
};

// If server.js is executed start the server
if (!module.parent) {
  exports.run();
}
