const taskcluster = require('taskcluster-client');
const assert = require('assert');
const Handler = require('../src/handler');
const load = require('../src/main');
const libUrls = require('taskcluster-lib-urls');
const {fakeauth, stickyLoader} = require('taskcluster-lib-testing');
const {FakeClient} = require('taskcluster-lib-pulse');

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

/**
 * Set up the sticky loader.  Since this service does not have secrets,
 * we don't use mockSuite, which would otherwise do this for us.
 *
 * This also sets the test rootUrl.
 */
exports.withLoader = () => {
  setup(async function() {
    exports.load.save();
    await exports.load('cfg');
    exports.load.cfg('taskcluster.rootUrl', libUrls.testRootUrl());
  });
  teardown(async function() {
    exports.load.restore();
  });
};

/**
 * Set up a Handler instance at helper.handler.  Call this after
 * withLoader.
 *
 * The handler is supplied with a fake Queue client:
 *  - task(taskId) returns a task from helper.handler.fakeTasks[taskId]
 *    and pushes the taskId onto helper.handler.taskCalls
 *  - listArtifacts(taskId, runId) returns
 *    helper.handler.fakeArtifacts[`${taskId}/${runId}`]
 *
 * helper.monitor is the (mock) monitor used by the handler
 *
 * helper.handler.publishedMessages contains {pushInfo, job} for each call to
 * publishJobMessage.
 */
exports.withHandler = () => {
  setup(async function() {
    const cfg = await exports.load('cfg');
    const validator = await exports.load('validator');
    const pulseClient = new FakeClient();
    exports.monitorBuilder = await exports.load('monitor');
    exports.monitor = exports.monitorBuilder.monitor();
    exports.handler = new Handler({
      cfg,
      prefix: 'foo',
      validator,
      pulseClient,
      queue: new taskcluster.Queue({
        rootUrl: cfg.taskcluster.rootUrl,
        fake: {
          task: async taskId => {
            exports.handler.taskCalls.push(taskId);
            const task = exports.handler.fakeTasks[taskId];
            assert(task, 'no task found');
            return task;
          },
          listArtifacts: async (taskId, runId) => {
            const key = `${taskId}/${runId}`;
            const artifacts = exports.handler.fakeArtifacts[key];
            assert(artifacts, 'no artifact found');
            return {artifacts: artifacts};
          },
        },
      }),
      queueEvents: new taskcluster.QueueEvents({
        rootUrl: cfg.taskcluster.rootUrl,
      }),
      monitor: exports.monitor,
    });

    exports.handler.publishJobMessage = async (pushInfo, job) => {
      exports.handler.publishedMessages.push({pushInfo, job});
    };

    exports.handler.fakeTasks = {};
    exports.handler.taskCalls = [];
    exports.handler.fakeArtifacts = {};
    exports.handler.publishedMessages = [];
  });

  teardown(() => {
    exports.monitorBuilder.reset();
  });

};
