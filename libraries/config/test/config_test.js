const config = require('../');
const path = require('path');
const assume = require('assume');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {

  test('load yaml', () => {
    let cfg = config({
      serviceName: 'test',
      files: [
        {path: path.join(__dirname, 'test.yml'), required: true},
      ],
    });

    assume(cfg).deep.equals({
      text: ['Hello', 'World'],
    });
  });

  test('load profile', () => {
    let cfg = config({
      serviceName: 'test',
      files: [
        {path: path.join(__dirname, 'test-profile.yml'), required: true},
      ],
      profile: 'danish',
    });
    assume(cfg).deep.equals({
      text: ['Hej', 'Verden'],
    });
  });

  test('load profile (default)', () => {
    let cfg = config({
      serviceName: 'test',
      files: [
        {path: path.join(__dirname, 'test-profile.yml'), required: true},
      ],
    });

    assume(cfg).deep.equals({
      text: ['Hello', 'World'],
    });
  });

  test('load !env', () => {
    let cfg = config({
      serviceName: 'test',
      files: [
        {path: path.join(__dirname, 'test-env.yml'), required: true},
      ],
      env: {
        ENV_VARIABLE: 'env-var-value',
        ENV_NUMBER: '32.4',
        ENV_TRUE: 'true',
        ENV_FALSE: 'false',
        ENV_JSON: '{"test": 42}',
        ENV_LIST: 'abc def "qouted string" \'\'',
        ENV_EMPTY: '',
      },
    });

    assume(cfg).deep.equals({
      text: 'env-var-value',
      text2: 'env-var-value',
      number: 32.4,
      soTrue: true,
      unTrue: false,
      notThere: undefined,
      empty: undefined,
      optional: undefined,
      json: {test: 42},
      list: ['abc', 'def', 'qouted string', ''],
    });
  });

  test('load missing file', () => {
    assume(() => {
      config({
        serviceName: 'test',
        files: [
          {path: path.join(__dirname, 'file-that-doesnt-exist.yml'), required: false},
        ],
      });
    }).throws(/Must load at least one configuration/);
  });

  test('load yaml (merge missing file)', () => {
    let cfg = config({
      serviceName: 'test',
      files: [
        {path: path.join(__dirname, 'test.yml'), required: true},
        {path: path.join(__dirname, 'file-that-doesnt-exist.yml'), required: false},
      ],
    });

    assume(cfg).deep.equals({
      text: ['Hello', 'World'],
    });
  });

  test('load !env and overwrite text', () => {
    let cfg = config({
      serviceName: 'test',
      files: [
        {path: path.join(__dirname, 'test.yml'), required: true},
        {path: path.join(__dirname, 'test-env.yml'), required: true},
      ],
      env: {
        ENV_VARIABLE: 'env-var-value',
        ENV_NUMBER: '32.4',
        ENV_TRUE: 'true',
        ENV_FALSE: 'false',
        ENV_JSON: '{"test": 42}',
        ENV_LIST: 'abc def "qouted string" \'\'',
        ENV_EMPTY: '',
      },
    });

    assume(cfg).deep.equals({
      text: 'env-var-value',
      text2: 'env-var-value',
      number: 32.4,
      soTrue: true,
      unTrue: false,
      notThere: undefined,
      empty: undefined,
      optional: undefined,
      json: {test: 42},
      list: ['abc', 'def', 'qouted string', ''],
    });
  });

  test('load !env and fallback text', () => {
    let cfg = config({
      serviceName: 'test',
      files: [
        {path: path.join(__dirname, 'test.yml'), required: true},
        {path: path.join(__dirname, 'test-env.yml'), required: true},
      ],
      env: {
        ENV_NUMBER: '32.4',
        ENV_TRUE: 'true',
        ENV_FALSE: 'false',
        ENV_JSON: '{"test": 42}',
        ENV_LIST: 'abc def "qouted string" \'\'',
        ENV_EMPTY: '',
      },
    });

    assume(cfg).deep.equals({
      text: ['Hello', 'World'],
      text2: undefined,
      number: 32.4,
      soTrue: true,
      unTrue: false,
      notThere: undefined,
      empty: undefined,
      optional: undefined,
      json: {test: 42},
      list: ['abc', 'def', 'qouted string', ''],
    });
  });

  test('load !env listing', () => {
    const vars = config({
      serviceName: 'test',
      files: [
        {path: path.join(__dirname, 'test-env.yml'), required: true},
      ],
      env: {}, // Notice they do not need to be in the env to do this
      getEnvVars: true,
    });

    assume(vars).deep.equals([
      { type: '!env', var: 'ENV_VARIABLE', optional: false },
      { type: '!env:string', var: 'ENV_VARIABLE', optional: false },
      { type: '!env:number', var: 'ENV_NUMBER', optional: false },
      { type: '!env:bool', var: 'ENV_TRUE', optional: false },
      { type: '!env:bool', var: 'ENV_FALSE', optional: false },
      { type: '!env:bool', var: 'ENV_NOT_SET', optional: false },
      { type: '!env', var: 'ENV_EMPTY', optional: false },
      { type: '!env', var: 'ENV_OPTIONAL', optional: true },
      { type: '!env:json', var: 'ENV_JSON', optional: false },
      { type: '!env:list', var: 'ENV_LIST', optional: false },
    ]);
  });
});
