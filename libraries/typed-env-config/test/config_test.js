suite("config", function() {
  var config  = require('../');
  var path    = require('path');
  var assume  = require('assume');

  test("load yaml", () => {
    let cfg = config({
      files: [
        path.join(__dirname, 'test.yml')
      ]
    });

    assume(cfg).deep.equals({
      text: ['Hello', 'World']
    });
  });

  test("load profile", () => {
    let cfg = config({
      files: [
        path.join(__dirname, 'test-profile.yml')
      ],
      profile:  'danish'
    });

    assume(cfg).deep.equals({
      text: ['Hej', 'Verden']
    });
  });

  test("load profile (default)", () => {
    let cfg = config({
      files: [
        path.join(__dirname, 'test-profile.yml')
      ]
    });

    assume(cfg).deep.equals({
      text: ['Hello', 'World']
    });
  });

  test("load !env", () => {
    let cfg = config({
      files: [
        path.join(__dirname, 'test-env.yml')
      ],
      env: {
        ENV_VARIABLE:     'env-var-value',
        ENV_NUMBER:       '32.4',
        ENV_DEFINED:      'true',
        ENV_TRUE:         'true',
        ENV_FALSE:        'false',
        ENV_JSON:         '{"test": 42}',
        ENV_LIST:         'abc def "qouted string" \'\''
      }
    });

    assume(cfg).deep.equals({
      text:       'env-var-value',
      text2:      'env-var-value',
      number:     32.4,
      unsetflag:  false,
      setflag:    true,
      soTrue:     true,
      unTrue:     false,
      json:       {test: 42},
      list:       ["abc", "def", "qouted string", ""]
    });
  });

  test("load missing file", () => {
    let cfg = config({
      files: [
        path.join(__dirname, 'file-that-doesnt-exist.yml')
      ]
    });

    assume(cfg).deep.equals(undefined);
  });

  test("load yaml (merge missing file)", () => {
    let cfg = config({
      files: [
        path.join(__dirname, 'test.yml'),
        path.join(__dirname, 'file-that-doesnt-exist.yml')
      ]
    });

    assume(cfg).deep.equals({
      text: ['Hello', 'World']
    });
  });

  test("load !env and overwrite text", () => {
    let cfg = config({
      files: [
        path.join(__dirname, 'test.yml'),
        path.join(__dirname, 'test-env.yml')
      ],
      env: {
        ENV_VARIABLE:     'env-var-value',
        ENV_NUMBER:       '32.4',
        ENV_DEFINED:      'true',
        ENV_TRUE:         'true',
        ENV_FALSE:        'false',
        ENV_JSON:         '{"test": 42}',
        ENV_LIST:         'abc def "qouted string" \'\''
      }
    });

    assume(cfg).deep.equals({
      text:       'env-var-value',
      text2:      'env-var-value',
      number:     32.4,
      unsetflag:  false,
      setflag:    true,
      soTrue:     true,
      unTrue:     false,
      json:       {test: 42},
      list:       ["abc", "def", "qouted string", ""]
    });
  });

  test("load !env and fallback text", () => {
    let cfg = config({
      files: [
        path.join(__dirname, 'test.yml'),
        path.join(__dirname, 'test-env.yml')
      ],
      env: {
        ENV_NUMBER:       '32.4',
        ENV_DEFINED:      'true',
        ENV_TRUE:         'true',
        ENV_FALSE:        'false',
        ENV_JSON:         '{"test": 42}',
        ENV_LIST:         'abc def "qouted string" \'\''
      }
    });

    assume(cfg).deep.equals({
      text:       ['Hello', 'World'],
      text2:      undefined,
      number:     32.4,
      unsetflag:  false,
      setflag:    true,
      soTrue:     true,
      unTrue:     false,
      json:       {test: 42},
      list:       ["abc", "def", "qouted string", ""]
    });
  });

  test("yell when options are wrong format", () => {
    assume(() => {
      config('oops');
    }).throws("Options must be an object!");
  });
});
