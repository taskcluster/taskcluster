const taskcluster = require('../');
const nock = require('nock');
const crypto = require('crypto');
const assert = require('assert').strict;
const testing = require('taskcluster-lib-testing');
const { WritableStreamBuffer, ReadableStreamBuffer } = require('stream-buffers');
const helper = require('./helper');

suite(testing.suiteName(), function() {
  helper.withRestoredEnvVars();

  /**
   * These tests require credentials with the scopes shown in authorizedScopes, below.
   */
  let object;
  suiteSetup(function() {
    const haveConfig =
      process.env.TASKCLUSTER_ROOT_URL &&
      process.env.TASKCLUSTER_CLIENT_ID &&
      process.env.TASKCLUSTER_ACCESS_TOKEN;
    if (haveConfig) {
      object = new taskcluster.Object({
        ...taskcluster.fromEnvVars(),
        retries: 0,
        authorizedScopes: [
          "object:upload:taskcluster:taskcluster/test/client/*",
          "object:download:taskcluster/test/client/*",
        ],
      });
    } else if (process.env.NO_TEST_SKIP) {
      throw new Error("NO_TEST_SKIP is set but credentials are not available");
    } else {
      this.skip();
    }
  });

  const tryUploadAndDownload = async data => {
    const name = "taskcluster/test/client/" + taskcluster.slugid();
    const expires = taskcluster.fromNow('1 hour');

    await taskcluster.upload({
      projectId: "taskcluster",
      name,
      contentType: 'application/random',
      contentLength: data.length,
      expires,
      object,
      streamFactory: async () => {
        const stream = new ReadableStreamBuffer({ initialSize: data.length, frequency: 0 });
        stream.put(data);
        stream.stop();
        return stream;
      },
    });

    let stream;
    let contentType = await taskcluster.download({
      name,
      object,
      streamFactory: async () => {
        stream = new WritableStreamBuffer();
        return stream;
      },
    });

    assert(stream.getContents().equals(data));
    assert(contentType === "application/random");
  };

  test('upload and download a small object (dataInline)', async function() {
    await tryUploadAndDownload(Buffer.from("hello, world", "utf-8"));
  });

  test('upload and download a large object (putUrl)', async function() {
    const data = crypto.randomBytes(10240);
    await tryUploadAndDownload(data);
  });

  test('download of a nonexistent file fails', async function() {
    const name = "taskcluster/test/client/" + taskcluster.slugid();
    await assert.rejects(
      () => taskcluster.download({ name, object }),
      err => err.statusCode === 404);
  });

  const nockSuccessfulObjectApi = () => {
    nock(process.env.TASKCLUSTER_ROOT_URL)
      .put('/api/object/v1/upload/some-object')
      .reply(200, {
        expires: taskcluster.fromNow('1 hour'),
        projectId: 'taskcluster',
        uploadId: 'not checked',
        uploadMethod: {
          putUrl: {
            expires: taskcluster.fromNow('1 hour'),
            headers: {
              'X-Test-Header': 'test-value',
            },
            url: 'http://testing.example.com/upload',
          },
        },
      });
    nock(process.env.TASKCLUSTER_ROOT_URL)
      .post('/api/object/v1/finish-upload/some-object')
      .reply(200, {});
    nock(process.env.TASKCLUSTER_ROOT_URL)
      .put('/api/object/v1/start-download/some-object')
      .reply(200, {
        method: 'simple',
        url: 'http://testing.example.com/download',
      });
  };

  const callUpload = async (overrides = {}) => {
    const data = Buffer.from('hello world');
    await taskcluster.upload({
      projectId: "taskcluster",
      name: 'some-object',
      contentType: 'application/binary',
      contentLength: data.length,
      expires: taskcluster.fromNow('1 hour'),
      object,
      streamFactory: async () => {
        const stream = new ReadableStreamBuffer({ initialSize: data.length, frequency: 0 });
        stream.put(data);
        stream.stop();
        return stream;
      },
      ...overrides,
    });
  };

  test('simple download that encounters a 500 error retries', async function() {
    try {
      nockSuccessfulObjectApi();
      nock('http://testing.example.com')
        .get('/download')
        .reply(500, 'uhoh!');
      nock('http://testing.example.com')
        .get('/download')
        .reply(200, 'HeLlOwOrLd');

      await taskcluster.download({
        name: 'some-object',
        object,
        streamFactory: async () => new WritableStreamBuffer(),
      });
    } finally {
      nock.cleanAll();
    }
  });

  test('simple download that encounters a 400 error fails immediately', async function() {
    try {
      nockSuccessfulObjectApi();
      nock('http://testing.example.com')
        .get('/download')
        .reply(403, 'not great');

      await assert.rejects(() => taskcluster.download({
        name: 'some-object',
        object,
        streamFactory: async () => new WritableStreamBuffer(),
      }),
      /403/);
    } finally {
      nock.cleanAll();
    }
  });

  test('putUrl upload that encounters a 500 error retries', async function() {
    try {
      nockSuccessfulObjectApi();
      nock('http://testing.example.com')
        .put('/upload')
        .reply(500, 'aws is being aws');
      nock('http://testing.example.com')
        .put('/upload')
        .reply(200, 'sweet!');

      await callUpload();
    } finally {
      nock.cleanAll();
    }
  });

  test('putUrl upload that encounters a 400 error fails right away', async function() {
    try {
      nockSuccessfulObjectApi();
      nock('http://testing.example.com')
        .put('/upload')
        .reply(400, 'ya messed up that request');

      await assert.rejects(callUpload, /400/);
    } finally {
      nock.cleanAll();
    }
  });

  test('putUrl upload that encounters many 500 errors fails', async function() {
    try {
      nockSuccessfulObjectApi();
      nock('http://testing.example.com')
        .put('/upload')
        .reply(500, 'nope');
      nock('http://testing.example.com')
        .put('/upload')
        .reply(500, 'still nope');
      nock('http://testing.example.com')
        .put('/upload')
        .reply(501, 'more nope');

      await assert.rejects(() => callUpload({ retries: 2, delayFactor: 1 }), /501/);
    } finally {
      nock.cleanAll();
    }
  });

  suite("downloadArtifact", function() {
    let queue;
    let artifact;

    suiteSetup(function() {
      // for testing artifact downloads, we use a fake queue but a real object service.
      queue = new taskcluster.Queue({
        ...taskcluster.fromEnvVars(),
        retries: 0,
        fake: {
          artifact: async (taskId, runId, name) => {
            assert.equal(taskId, 'taskid');
            assert.equal(runId, 1);
            assert.equal(name, "public/test.file");
            return artifact;
          },
          latestArtifact: async (taskId, name) => {
            assert.equal(taskId, 'taskid');
            assert.equal(name, "public/test.file");
            return artifact;
          },
        },
      });
    });

    const createObject = async () => {
      const name = "taskcluster/test/client/" + taskcluster.slugid();
      const expires = taskcluster.fromNow('1 hour');
      const data = 'hello, world';

      await taskcluster.upload({
        projectId: "taskcluster",
        name,
        contentType: 'application/random',
        contentLength: data.length,
        expires,
        object,
        streamFactory: async () => {
          const stream = new ReadableStreamBuffer({ initialSize: data.length, frequency: 0 });
          stream.put(data);
          stream.stop();
          return stream;
        },
      });
      return name;
    };

    const tryDownloadArtifact = async () => {
      let stream;
      const contentType = await taskcluster.downloadArtifact({
        taskId: 'taskid',
        runId: 1,
        name: "public/test.file",
        queue,
        streamFactory: async () => {
          stream = new WritableStreamBuffer();
          return stream;
        },
        retries: 0,
      });
      return {
        contentType,
        content: stream.getContents(),
      };
    };

    test("s3 artifact", async function() {
      const name = await createObject();
      const { url } = await object.startDownload(name, { acceptDownloadMethods: { simple: true } });

      artifact = { storageType: 's3', url };

      const { contentType, content } = await tryDownloadArtifact();
      assert.equal(contentType, "application/random");
      assert.deepEqual(content, Buffer.from('hello, world'));
    });

    test("reference artifact", async function() {
      const name = await createObject();
      const { url } = await object.startDownload(name, { acceptDownloadMethods: { simple: true } });

      artifact = { storageType: 'reference', url };

      const { contentType, content } = await tryDownloadArtifact();
      assert.equal(contentType, "application/random");
      assert.deepEqual(content, Buffer.from('hello, world'));
    });

    test("object artifact", async function() {
      const name = await createObject();

      artifact = {
        storageType: 'object',
        name,
        credentials: taskcluster.createTemporaryCredentials({
          start: new Date(),
          expiry: taskcluster.fromNow('1 hour'),
          scopes: [`object:download:${name}`],
          credentials: taskcluster.fromEnvVars().credentials,
        }),
      };

      const { contentType, content } = await tryDownloadArtifact();
      assert.equal(contentType, "application/random");
      assert.deepEqual(content, Buffer.from('hello, world'));
    });

    test("error artifact", async function() {
      artifact = { storageType: 'error', message: 'oh noes', reason: 'test case' };

      await assert.rejects(
        () => tryDownloadArtifact(),
        err => err.message === 'oh noes' && err.reason === 'test case');
    });
  });
});
