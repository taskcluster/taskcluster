import express from 'express'
import passport from 'passport'
import assert from 'assert'
import persona from 'passport-persona'
import User from './../user'

class PersonaLogin {
  constructor(options) {
    assert(options, 'options are required');
    assert(options.cfg, 'options.cfg is required');
    assert(options.cfg.server, 'options.cfg.server is required');
    assert(options.cfg.server.publicUrl, 'options.cfg.server.publicUrl is required');
    assert(options.authorize, "options.authorize is required");

    // Mozillians client
    this.authorize = options.authorize;

    // Persona/mozillians configuration
    passport.use(new persona.Strategy({
      audience: options.cfg.server.publicUrl,
      passReqToCallback: true
    }, this.personaCallback.bind(this)));
  }

  router() {
    let router = new express.Router();
    router.post('/login', passport.authenticate('persona', {
      successRedirect: '/',
      failureRedirect: '/?err=mozillians-lookup',
      failureFlash: true
    }));
    return router;
  }

  async personaCallback(req, email, done) {
    console.log("personalCallback", this);
    try {
      let user = User.get(req);
      user.identity = 'persona/' + email;
      this.authorize(user, done);
    } catch (err) {
      done(err, null);
    }
  };

}

module.exports = PersonaLogin;
