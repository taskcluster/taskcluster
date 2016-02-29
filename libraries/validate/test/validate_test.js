suite("Validate Tests", () => {
  let assert = require('assert');
  let validator = require('../');
  let validate = null;

  suiteSetup( async () => {
    validate = await validator({
      folder: 'test/schemas',
      baseurl: 'http://localhost:1203/',
      constants: {'my-constant': 42},
    });
  });

  test("load from folder", () => {
    let errors = validate(
        {value: 42},
        'http://localhost:1203/test-schema.json');
    assert.equal(errors, null);
  });

  test("rejects non-schema-matching docs", () => {
    console.log(validate({}, 'def.yml'));
    assert(false);
  });

});
