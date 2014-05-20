# Passport-Persona

[Passport](https://github.com/jaredhanson/passport) strategy for authenticating
with [Mozilla Persona](https://login.persona.org/).

This module lets you authenticate using Mozilla Persona in your Node.js
applications.  By plugging into Passport, Persona authentication can be easily
and unobtrusively integrated into any application or framework that supports
[Connect](http://www.senchalabs.org/connect/)-style middleware, including
[Express](http://expressjs.com/).

Persona is a fallback Identity Provider for the [BrowserID](https://developer.mozilla.org/en-US/docs/Mozilla/Persona)
protocol, a distributed login system from [Mozilla](http://www.mozilla.org/).
This strategy verifies assertions using Mozilla's [Remote Verification API](https://developer.mozilla.org/en-US/docs/Mozilla/Persona/Remote_Verification_API).
Applications wishing to verify assertions locally should use
[passport-browserid](https://github.com/jaredhanson/passport-browserid).

## Install

    $ npm install passport-persona

## Usage

#### Configure Strategy

The Persona authentication strategy authenticates users using an assertion of
email address ownership, obtained via the [navigator.id](https://developer.mozilla.org/en-US/docs/Web/API/navigator.id)
JavaScript API.  The strategy requires a `verify` callback, which accepts an
email address and calls `done` providing a user.

    passport.use(new PersonaStrategy({
        audience: 'http://www.example.com'
      },
      function(email, done) {
        User.findByEmail({ email: email }, function (err, user) {
          return done(err, user);
        });
      }
    ));

#### Authenticate Requests

Use `passport.authenticate()`, specifying the `'persona'` strategy, to
authenticate requests.

For example, as route middleware in an [Express](http://expressjs.com/)
application:

    app.post('/auth/browserid', 
      passport.authenticate('persona', { failureRedirect: '/login' }),
      function(req, res) {
        // Successful authentication, redirect home.
        res.redirect('/');
      });

## Examples

For a complete, working example, refer to the [signin example](https://github.com/jaredhanson/passport-persona/tree/master/examples/signin).

## Tests

    $ npm install --dev
    $ make test

[![Build Status](https://secure.travis-ci.org/jaredhanson/passport-persona.png)](http://travis-ci.org/jaredhanson/passport-persona)

## Credits

  - [Jared Hanson](http://github.com/jaredhanson)
  - [Leo McArdle](https://github.com/LeoMcA)

## License

[The MIT License](http://opensource.org/licenses/MIT)

Copyright (c) 2011-2013 Jared Hanson <[http://jaredhanson.net/](http://jaredhanson.net/)>
