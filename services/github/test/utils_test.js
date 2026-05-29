import assert from 'assert';
import { Readable } from 'stream';
import testing from '@taskcluster/lib-testing';

import {
  throttleRequest,
  shouldSkipCommit,
  shouldSkipPullRequest,
  shouldSkipComment,
  getTaskclusterCommand,
  extractLog,
  ansi2txt,
  generateXHubSignature,
  checkGithubSignature,
} from '../src/utils.js';

/** Create a readable stream from a string */
const toStream = (str) => Readable.from([Buffer.from(str)]);

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
      skipMessages.forEach(body => assert.equal(false, shouldSkipPullRequest({
        pull_request: { title: 'regular title', body },
      })));
    });
  });

  suite('shouldSkipComment', function() {
    test('should not skip comment', function() {
      assert.equal(false, shouldSkipComment({
        action: 'created',
        comment: {
          body: ' /taskcluster cmd1 ',
        },
        issue: {
          state: 'open',
          pull_request: {},
        },
      }));
      assert.equal(false, shouldSkipComment({
        action: 'edited',
        comment: {
          body: `multi-line
          comment
          with
          /taskcluster cmd2
          inside`,
        },
        issue: {
          state: 'open',
          pull_request: {},
        },
      }));
    });
    test('should skip comment', function() {
      assert.equal(true, shouldSkipComment({
        action: 'deleted',
        comment: {},
        issue: { pull_request: {} },
      }));
      assert.equal(true, shouldSkipComment({
        action: 'created',
        comment: {
          body: `
          just a regular comment with link:
          taskcluster/taskcluster #4123
          `,
        },
        issue: { pull_request: {} },
      }));
      assert.equal(true, shouldSkipComment({
        action: 'created',
        comment: {},
        issue: { no_pull_request_info: {} },
      }));
      assert.equal(true, shouldSkipComment({
        action: 'created',
        comment: {
          body: '/taksluster valid-cmd',
        },
        issue: {
          state: 'closed', // issue is closed
          pull_request: {},
        },
      }));
      assert.equal(true, shouldSkipComment({
        action: 'edited',
        comment: {},
      }));
    });
  });

  suite('getTaskclusterCommand', function() {
    test('should return taskcluster command', function() {
      assert.equal('cmd-with-dashes1', getTaskclusterCommand({
        body: ' /taskcluster cmd-with-dashes1 ',
      }));
      assert.equal('cmd2', getTaskclusterCommand({
        body: `multi-line
        comment
        with
        /taskcluster cmd2
        inside`,
      }));
      assert.throws(() => {
        getTaskclusterCommand({
          body: 'no taskcluster command here',
        });
      }, /No taskcluster command found/);
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

  suite('extractLog', function() {
    // Reference implementation: the original sync extractLog from before the
    // streaming rewrite. Used to verify the new streaming version produces
    // identical output for all edge cases.
    const extractTailLinesFromLog = (logString, maxPayloadLength, tailLines) => {
      if (tailLines === 0) {
        return null;
      }
      const tl = logString.split('\n').slice(-tailLines).join('\n');
      if (logString.length <= maxPayloadLength) {
        return tl;
      }
      let tailLogMaxPayload = logString.slice(-maxPayloadLength);
      const newLinePosition = tailLogMaxPayload.indexOf('\n');
      tailLogMaxPayload = tailLogMaxPayload.slice(newLinePosition + 1);
      return tl.length <= tailLogMaxPayload.length ? tl : tailLogMaxPayload;
    };

    const extractHeadLinesFromLog = (logString, maxPayloadLength) => {
      if (logString.length <= maxPayloadLength) {
        return logString;
      }
      const headLog = logString.slice(0, maxPayloadLength);
      const lastNewLinePosition = headLog.lastIndexOf('\n');
      return headLog.substring(0, lastNewLinePosition);
    };

    const originalExtractLog = (log, headLines = 20, tailLines = 200, maxPayloadLength = 30000) => {
      const logString = ansi2txt(log);
      const lines = logString.split('\n');
      const LOG_BUFFER = 42;
      if (lines.length <= headLines + tailLines && logString.length <= maxPayloadLength) {
        return logString;
      }
      const headLogArray = lines.slice(0, headLines);
      const headLog = headLogArray.join('\n');
      if (maxPayloadLength <= headLog.length) {
        return extractHeadLinesFromLog(logString, maxPayloadLength);
      }
      const tl = extractTailLinesFromLog(logString, maxPayloadLength - headLog.length - LOG_BUFFER, tailLines);
      if (!tl) {
        return `${headLog}\n\n...(${lines.length - headLogArray.length} lines hidden)...\n\n`;
      }
      const availableTailLines = tl.split('\n').length;
      return `${headLog}\n\n...(${lines.length - headLines - availableTailLines} lines hidden)...\n\n${tl}`;
    };

    /** Generate a log with the given number of lines */
    const generateLog = (numLines) =>
      Array.from({ length: numLines }, (_, i) => `line ${i}: ${'x'.repeat(20)}`).join('\n');

    /**
     * Assert that the streaming extractLog produces identical output to the
     * original string-based implementation for the given input.
     */
    const assertMatchesOriginal = async (log, headLines = 20, tailLines = 200, maxPayloadLength = 30000) => {
      const expected = originalExtractLog(log, headLines, tailLines, maxPayloadLength);
      const actual = await extractLog(toStream(log), headLines, tailLines, maxPayloadLength);
      assert.strictEqual(actual, expected);
    };

    test('empty log', async function() {
      await assertMatchesOriginal('');
    });

    test('short log (3 lines)', async function() {
      await assertMatchesOriginal(generateLog(3));
    });

    test('log with exactly headLines lines (20), no tail', async function() {
      await assertMatchesOriginal(generateLog(20));
    });

    test('log with headLines + 1 (21 lines)', async function() {
      await assertMatchesOriginal(generateLog(21));
    });

    test('log with exactly headLines + tailLines (220 lines, 0 hidden)', async function() {
      await assertMatchesOriginal(generateLog(220));
    });

    test('log with headLines + tailLines + 1 (221 lines, 1 hidden)', async function() {
      await assertMatchesOriginal(generateLog(221));
    });

    test('log with 100 lines hidden', async function() {
      await assertMatchesOriginal(generateLog(320));
    });

    test('large log (1000 lines)', async function() {
      await assertMatchesOriginal(generateLog(1000));
    });

    test('long single line exceeding maxPayloadLength', async function() {
      const payload = Array.from({ length: 10 }).map((_, i) => `line: ${i}`);
      payload.push('A'.repeat(100000));
      await assertMatchesOriginal(payload.join('\n'), 20, 200, 60000);
    });

    test('head alone exceeds maxPayloadLength', async function() {
      // 20 lines of 2000 chars each = 40000 chars in head
      const log = Array.from({ length: 500 }, (_, i) => `line ${i}: ${'x'.repeat(2000)}`).join('\n');
      await assertMatchesOriginal(log, 20, 200, 30000);
    });

    test('respects custom maxPayloadLength', async function() {
      await assertMatchesOriginal(generateLog(500), 20, 200, 5000);
    });

    test('respects custom maxPayloadLength (60000)', async function() {
      await assertMatchesOriginal(generateLog(500), 20, 200, 60000);
    });

    test('strips ANSI control sequences', async function() {
      const payload = '\u001b[32mgreen text\u001b[0m\nnormal line';
      await assertMatchesOriginal(payload);
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
