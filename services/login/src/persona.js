var browserIdVerify = require('browserid-verify');

class PersonaError extends Error {
  constructor(message) {
    super();
    this.code = "PersonaError";
    this.message = message;
  }
}

class PersonaVerifier {
  constructor(options) {
    this.allowedAudiences = options.allowedAudiences || [];
    this.verifier = browserIdVerify();
  }

  /**
   * Invoke the BrowserID verifier, returning a promise that will fire with the
   * verified email address.  Persona exceptions will include `code:
   * "PersonaError'`.
   */
  verify(assertion, audience) {
    return new Promise((resolve, reject) => {
      if (this.allowedAudiences.indexOf(audience) === -1) {
        throw new PersonaError("audience not allowed");
      }
      this.verifier(assertion, audience, (err, email, response) => {
        if (err) {
          reject(err);
        } else if (response.status == "failure") {
          reject(new PersonaError(response.reason));
        } else if (!email) {
          reject(new PersonaError("no email returned"));
        } else {
          resolve(email);
        }
      });
    });
  }
}

module.exports = PersonaVerifier;
