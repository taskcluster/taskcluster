import assert from 'assert';
import testing from 'taskcluster-lib-testing';

import {
  throttleRequest,
  shouldSkipCommit,
  shouldSkipPullRequest,
  tailLog,
  ansi2txt,
  generateXHubSignature,
  checkGithubSignature,
} from '../src/utils.js';

suite(testing.suiteName(), function() {
  suite('throttleRequest', function() {
    let oldRequest;

    suiteSetup(function() {
      oldRequest = throttleRequest.request;
    });

    teardown(function() {
      throttleRequest.request = oldRequest;
    });

    test('calls with the given method and url and returns a success result immediately', async function() {
      throttleRequest.request = async (method, url) => {
        assert.equal(method, 'GET');
        assert.equal(url, 'https://foo');
        return { result: true };
      };

      const res = await throttleRequest({ url: 'https://foo', method: 'GET' });
      assert.deepEqual(res, { result: true });
    });

    test('4xx statuses are returned (not thrown) immediately', async function() {
      let calls = 0;

      throttleRequest.request = async (method, url) => {
        calls++;
        const err = new Error('uhoh');
        err.status = 424;
        throw err;
      };

      const res = await throttleRequest({ url: 'https://foo', method: 'GET' });
      assert.equal(res.status, 424);
      assert.equal(calls, 1); // didn't retry
    });

    test('5xx statuses are retried', async function() {
      let calls = 0;

      throttleRequest.request = async (method, url) => {
        calls++;
        const err = new Error('uhoh');
        err.status = 543;
        throw err;
      };

      // (set delay=10 to retry more quickly than usual)
      const res = await throttleRequest({ url: 'https://foo', method: 'GET', delay: 10 });
      assert.equal(res.status, 543);
      assert.equal(calls, 5);
    });

    test('5xx status retried once returns successful result', async function() {
      let calls = 0;

      throttleRequest.request = async (method, url) => {
        calls++;
        if (calls >= 1) {
          return { status: 200 };
        }
        const err = new Error('uhoh');
        err.status = 543;
        throw err;
      };

      const res = await throttleRequest({ url: 'https://foo', method: 'GET', delay: 10 });
      assert.equal(res.status, 200);
      assert.equal(calls, 1);
    });

    test('connection errors are thrown directly', async function() {
      throttleRequest.request = async (method, url) => {
        const err = new Error('uhoh');
        err.code = 'ECONNREFUSED';
        throw err;
      };

      await assert.rejects(
        () => throttleRequest({ url: 'https://foo', method: 'GET', delay: 10 }),
        err => err.code === 'ECONNREFUSED');
    });
  });
  suite('shouldSkipCommit', function() {
    const skipMessages = [
      '[CI Skip] this is not ready',
      'this is WIP [ci skip]',
      '[SKIP CI] WORKING ON IT',
      'testing things out [skip CI] .. please wait',
    ];

    test('should not skip commit', function() {
      assert.equal(false, shouldSkipCommit({
        commits: [{
          message: 'first commit',
        }, {
          message: 'more than one commit, do not skip',
        }],
      }));
      assert.equal(false, shouldSkipCommit({
        commits: [{
          message: 'first commit with normal message, no ci skip present',
        }],
      }));
      assert.equal(false, shouldSkipCommit({
        _extra: 'should not skip because skip commit is not the latest commit',
        commits: [{
          message: 'first commit',
        }, {
          message: 'second commit [ci skip] please',
        }, {
          message: 'third commit, no skip',
        }],
      }));
      assert.equal(false, shouldSkipCommit({
        _extra: 'this is not even a valid payload',
        commits: [],
      }));
      assert.equal(false, shouldSkipCommit({
        _extra: 'this has only a head_commit',
        commits: [],
        head_commit: {
          message: 'just a regular commit',
        },
      }));
      // should not skip as this is not present in latest commit
      skipMessages.forEach(message => assert.equal(false, shouldSkipCommit({
        commits: [{ message }, { message: 'this commit is the last' }],
      })));
    });
    test('should skip commit', function() {
      skipMessages.forEach(message => assert.equal(true, shouldSkipCommit({
        commits: [{ message: 'this commit is the first' }, { message }],
      })));

      skipMessages.forEach(message => assert.equal(true, shouldSkipCommit({
        head_commit: { message },
      })));
    });
  });
  suite('shouldSkipPullRequest', function() {
    test('should not skip pull request', function() {
      assert.equal(false, shouldSkipPullRequest({
        pull_request: {
          title: 'Regular pr title',
        },
      }));
      assert.equal(false, shouldSkipPullRequest({
        something: 'This one does not include pull_request for some reason',
      }));
    });
    test('should skip pull request', function() {
      const skipMessages = [
        'PR: [CI Skip] this is not ready',
        'PR: this is WIP [skip ci]',
      ];
      skipMessages.forEach(title => assert.equal(true, shouldSkipPullRequest({
        pull_request: { title },
      })));
      skipMessages.forEach(body => assert.equal(true, shouldSkipPullRequest({
        pull_request: { title: 'regular title', body },
      })));
    });
  });

  suite('ansi2txt', function() {
    test('it should remove control sequences', function() {
      const src = [
        '[0m[7m[1m[32m PASS [39m[22m[27m[0m [2msrc/utils/[22m[1misDateWithin.test.js[22m',
        '[2K[1G[2m$ webpack --mode production[22m',
        'test factory::test::file_reader_twice ... [31mFAILED(B[m',
        '[0m[0m[1m[31merror[0m[1m:[0m test failed, to rerun pass `-p taskcluster-upload --lib`',
      ];
      const expected = [
        ' PASS  src/utils/isDateWithin.test.js',
        '$ webpack --mode production',
        'test factory::test::file_reader_twice ... FAILED',
        'error: test failed, to rerun pass `-p taskcluster-upload --lib`',
      ];
      assert.equal(expected.join('\n'), ansi2txt(src.join('\n')));
    });
  });

  suite('tailLog', function() {
    test('should get max lines', function () {
      const payload = Array.from({ length: 500 }).map(line => `line: ${line}`).join('\n');
      assert.equal(250, tailLog(payload).split('\n').length);
      assert.equal(25, tailLog(payload, 25).split('\n').length);

      const payloadLong = Array.from({ length: 10 }).map(line => 'line'.repeat(1000)).join('\n');
      assert.equal(1, tailLog(payloadLong, 10, 20).split('\n').length);
      assert.equal('line', tailLog(payloadLong, 10, 4));
    });
  });

  suite('generateXHubSignature', function() {
    test('supports sha1', function () {
      assert.equal(
        generateXHubSignature('secret', '{payload}', 'sha1'),
        'sha1=ab20ad67182f5ac039c105be046648f980d60558',
      );
    });
    test('supports sha256', function () {
      assert.equal(
        generateXHubSignature('secret', '{payload}', 'sha256'),
        'sha256=f3529481beccfe73834584412ff46b39f067c6664ab34a409f4ef4b3790a80be',
      );
    });
    test('throws on invalid algorithm', function () {
      assert.throws(() => {
        generateXHubSignature('secret', 'payload', 'sha999');
      }, /Invalid algorithm/);
    });
  });
  suite('checkGithubSignature', function() {
    test('supports sha1', function () {
      assert.equal(
        checkGithubSignature('secret', '{payload}', 'sha1=ab20ad67182f5ac039c105be046648f980d60558'),
        true,
      );
      assert.equal(
        checkGithubSignature('wrongSecret', '{payload}', 'sha1=ab20ad67182f5ac039c105be046648f980d60558'),
        false,
      );
    });
    test('supports sha256', function () {
      assert.equal(
        checkGithubSignature('secret', '{payload}', 'sha256=f3529481beccfe73834584412ff46b39f067c6664ab34a409f4ef4b3790a80be'),
        true,
      );
      assert.equal(
        checkGithubSignature('wrongSecret', '{payload}', 'sha256=f3529481beccfe73834584412ff46b39f067c6664ab34a409f4ef4b3790a80be'),
        false,
      );
    });
  });
});
