suite("Invalid Schema Tests", () => {
  let assert = require('assert');
  let validator = require('../');
  let debug = require('debug')('test')

  test("load from invalid folder", async (done) => {
    try {
      let validate = await validator({
        folder: 'test/invalid-schemas',
        baseurl: 'http://localhost:1203/',
      });
      assert(false, "Bad schema should've thrown an exception!");
    } catch(e) {
      debug("Bad schema has thrown an exception correctly.");
    } finally {
      done();
    }
  });

});
