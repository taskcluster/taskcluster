const {Secrets, stickyLoader} = require('../');
const assert = require('assert');
const nock = require('nock');

let old_TASK_ID;
const clearEnv = () => {
  old_TASK_ID = process.env.TASK_ID;
  delete process.env.TASK_ID;
  delete process.env.PASS_IN_ENV;
  delete process.env.PASS_IN_BOTH;
};

const resetEnv = () => {
  process.env.TASK_ID = old_TASK_ID;
  delete process.env.PASS_IN_ENV;
  delete process.env.PASS_IN_BOTH;
};

suite('Secrets', function() {
  suiteSetup(clearEnv);
  suiteTeardown(resetEnv);

  const loader = (component, overwrites) => {
    if (component in overwrites) {
      return overwrites[component];
    }
    assert(component !== 'cfg', 'unexpected load of cfg');
    return Promise.resolve({component});
  };
  const sticky = stickyLoader(loader);

  setup(function() {
    sticky.save();
  });

  teardown(function() {
    sticky.restore();
  });

  suite('have / get', function() {
    let secrets;
    setup(function() {
      secrets = new Secrets({
        secretName: 'path/to/secret',
        secrets: {
          envOnly: [{env: 'PASS_IN_ENV'}],
          cfgOnly: [{cfg: 'cfgonly.pass', name: 'cfgonly'}],
          envAndCfg: [{env: 'PASS_IN_BOTH', cfg: 'both.pass'}],
        },
        load: sticky,
      });
      secrets._fetchSecrets = async () => {
        throw new Error('unexpected secrets fetch');
      };

      sticky.inject('cfg', {});
    });

    test('with nothing', async function() {
      sticky.inject('cfg', {});
      await secrets.setup();
      assert(!secrets.have('envOnly'));
      assert.throws(() => secrets.get('envOnly'));
      assert(!secrets.have('cfgOnly'));
      assert.throws(() => secrets.get('cfgOnly'));
      assert(!secrets.have('envAndCfg'));
      assert.throws(() => secrets.get('envAndCfg'));
    });

    test('with no cfg properties', async function() {
      secrets = new Secrets({
        secretName: 'path/to/secret',
        secrets: {
          envOnly: [{env: 'PASS_IN_ENV'}],
        },
        load: sticky,
      });

      // note; the fake loader above fails if 'cfg' is loaded
      await secrets.setup();
      assert(!secrets.have('envOnly'));
      assert.throws(() => secrets.get('envOnly'));
    });

    test('with config', async function() {
      sticky.inject('cfg', {cfgonly: {pass: 'PP'}, both: {pass: 'P2'}});
      await secrets.setup();
      assert(!secrets.have('envOnly'));
      assert.throws(() => secrets.get('envOnly'));
      assert(secrets.have('cfgOnly'));
      assert.deepEqual(secrets.get('cfgOnly'), {cfgonly: 'PP'});
      assert(secrets.have('envAndCfg'));
      assert.deepEqual(secrets.get('envAndCfg'), {PASS_IN_BOTH: 'P2'});
    });

    test('have with a false value', async function() {
      sticky.inject('cfg', {cfgonly: {pass: false}});
      await secrets.setup();
      assert(secrets.have('cfgOnly'));
      assert.deepEqual(secrets.get('cfgOnly'), {cfgonly: false});
    });

    test('with env', async function() {
      process.env.PASS_IN_ENV = 'PIE';
      process.env.PASS_IN_BOTH = 'PIB';
      sticky.inject('cfg', {});
      await secrets.setup();
      assert(secrets.have('envOnly'));
      assert.deepEqual(secrets.get('envOnly'), {PASS_IN_ENV: 'PIE'});
      assert(!secrets.have('cfgOnly'));
      assert.throws(() => secrets.get('cfgOnly'));
      assert(secrets.have('envAndCfg'));
      assert.deepEqual(secrets.get('envAndCfg'), {PASS_IN_BOTH: 'PIB'});
    });

    test('with env via secrets service', async function() {
      secrets._fetchSecrets = async () => ({PASS_IN_ENV: 'PIE', PASS_IN_BOTH: 'PIB'});
      sticky.inject('cfg', {});
      await secrets.setup();
      assert(secrets.have('envOnly'));
      assert.deepEqual(secrets.get('envOnly'), {PASS_IN_ENV: 'PIE'});
      assert(!secrets.have('cfgOnly'));
      assert.throws(() => secrets.get('cfgOnly'));
      assert(secrets.have('envAndCfg'));
      assert.deepEqual(secrets.get('envAndCfg'), {PASS_IN_BOTH: 'PIB'});
    });

    test('with env and config', async function() {
      process.env.PASS_IN_ENV = 'PIE';
      process.env.PASS_IN_BOTH = 'PIB';
      sticky.inject('cfg', {cfgonly: {pass: 'PP'}, both: {pass: 'P2'}});
      await secrets.setup();
      assert(secrets.have('envOnly'));
      assert.deepEqual(secrets.get('envOnly'), {PASS_IN_ENV: 'PIE'});
      assert(secrets.have('cfgOnly'));
      assert.deepEqual(secrets.get('cfgOnly'), {cfgonly: 'PP'});
      assert(secrets.have('envAndCfg'));
      // NOTE: this prefers the config value!
      assert.deepEqual(secrets.get('envAndCfg'), {PASS_IN_BOTH: 'P2'});
    });
  });

  suite('mockSuite with secrets missing', function() {
    const secrets = new Secrets({
      secretName: 'path/to/secret',
      secrets: {
        sec: [{name: 'sec'}],
      },
      load: sticky,
    });
    let testsRun = [];

    secrets.mockSuite('outer', ['sec'], function(mock) {
      test('inner', () => {
        testsRun.push(mock);
      });
    });

    suiteTeardown(function() {
      assert.deepEqual(testsRun, [true], 'expected just the mock run');
    });
  });

  suite('mockSuite with secrets present', function() {
    const secrets = new Secrets({
      secretName: 'path/to/secret',
      secrets: {
        sec: [{name: 'sec', cfg: 'sec'}],
      },
      load: sticky,
    });
    let testsRun = [];

    suiteSetup(function() {
      sticky.inject('cfg', {sec: 'here'});
    });

    secrets.mockSuite('outer', ['sec'], function(secrets) {
      test('inner', () => {
        testsRun.push(secrets);
      });
    });

    suiteTeardown(function() {
      assert.deepEqual(testsRun, [true, false], 'expected both runs');
    });
  });
  // NOTE: testing NO_TEST_SKIP would generate a failed test, so we do not attempt to test that.

  suite('_fetchSecrets', function() {
    const secrets = new Secrets({
      secretName: 'path/to/secret',
      secrets: {
        sec: [{name: 'sec', env: 'SECRET_VALUE', cfg: 'sec'}],
      },
    });

    suiteSetup(function() {
      nock('http://taskcluster:80')
        .get('/secrets.taskcluster.net/v1/secret/path%2Fto%2Fsecret')
        .reply(200, (uri, requestBody) => {
          return {secrets: {SECRET_VALUE: '13'}};
        });
    });

    suiteTeardown(function() {
      nock.cleanAll();
    });

    test('with TASK_ID set', async function() {
      process.env.TASK_ID = '1234';
      assert.deepEqual(await secrets._fetchSecrets(), {SECRET_VALUE: '13'});
    });
  });
});

