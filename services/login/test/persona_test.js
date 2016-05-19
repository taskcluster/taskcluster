import 'mocha'
import assume from 'assume'
import PersonaVerifier from '../lib/persona';

suite('persona', function() {
  let personaVerifier = new PersonaVerifier({allowedAudiences: ['audie']});

  test("returns email on success", async function() {
    personaVerifier.verifier = (assertion, audience, cb) => {
      assume(assertion).to.equal("abcd");
      assume(audience).to.equal("audie");
      cb(null, "nobody@persona.org", {'status': 'okay'});
    }
    assume(await personaVerifier.verify("abcd", "audie")).to.equal('nobody@persona.org');
  });

  test("throws error on failure", async function() {
    personaVerifier.verifier = (assertion, audience, cb) => {
      assume(assertion).to.equal("abcd");
      assume(audience).to.equal("audie");
      cb(null, undefined, {'status': 'failure', 'reason': 'uh oh'});
    }
    try {
      await personaVerifier.verify("abcd", "audie");
    } catch(err) {
      assume(err.message).to.equal('uh oh');
      return;
    }
    throw new Error("unexpected success");
  });

  test("rethrows errors", async function() {
    personaVerifier.verifier = (assertion, audience, cb) => {
      assume(assertion).to.equal("abcd");
      assume(audience).to.equal("audie");
      cb(new Error("uhoh"));
    }
    try {
      await personaVerifier.verify("abcd", "audie");
    } catch(err) {
      assume(err.message).to.equal('uhoh');
      return;
    }
    throw new Error("unexpected success");
  });

  test("fails if audience is not whitelisted", async function() {
    personaVerifier.verifier = (assertion, audience, cb) => {
      cb(new Error("should not get here"));
    }
    try {
      await personaVerifier.verify("abcd", "not-audie");
    } catch(err) {
      assume(err.message).to.equal('audience not allowed');
      return;
    }
    throw new Error("unexpected success");
  });
});
