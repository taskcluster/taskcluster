const assert = require('assert');
const path = require('path');
const aws = require('aws-sdk');
const taskcluster = require('taskcluster-client');
const {stickyLoader, Secrets, fakeauth, withEntity, withPulse, withMonitor} = require('taskcluster-lib-testing');
const builder = require('../src/api');
const load = require('../src/main');
const RateLimit = require('../src/ratelimit');
const data = require('../src/data');
const libUrls = require('taskcluster-lib-urls');

const testclients = {
  'test-client': ['*'],
  'test-server': ['*'],
};

exports.suiteName = path.basename;
exports.rootUrl = 'http://localhost:60401';

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

withMonitor(exports);

// set up the testing secrets
exports.secrets = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-notify',
  secrets: {
    taskcluster: [
      {env: 'TASKCLUSTER_CLIENT_ID', cfg: 'taskcluster.credentials.clientId', name: 'clientId'},
      {env: 'TASKCLUSTER_ACCESS_TOKEN', cfg: 'taskcluster.credentials.accessToken', name: 'accessToken'},
      {env: 'TASKCLUSTER_ROOT_URL', cfg: 'taskcluster.rootUrl', name: 'rootUrl', mock: libUrls.testRootUrl()},
    ],
    aws: [
      {env: 'AWS_ACCESS_KEY_ID', cfg: 'aws.accessKeyId'},
      {env: 'AWS_SECRET_ACCESS_KEY', cfg: 'aws.secretAccessKey'},
    ],
  },
  load: exports.load,
});

/**
 * Define a fake denier that will deny anything with 'denied' in the address
 */
exports.withDenier = (mock, skipping) => {
  suiteSetup('withDenier', async function() {
    if (skipping()) {
      return;
    }

    exports.load.inject('denier', {
      isDenied: async (notificationType, notificationAddress) =>
        /denied/.test(notificationAddress),
    });
  });
};

class MockSES {
  constructor() {
    this.emails = [];
  }

  sendRawEmail(c, callback) {
    this.emails.push({
      delivery: {recipients: c.Destinations},
      data: c.RawMessage.Data.toString(),
    });
    callback(null, {});
  }

  reset() {
    this.emails = [];
  }
}

exports.withSES = (mock, skipping) => {
  let ses;
  let sqs;

  suiteSetup('withSES', async function() {
    if (skipping()) {
      return;
    }

    const cfg = await exports.load('cfg');

    if (mock) {
      ses = new MockSES();
      exports.load.inject('ses', ses);
      exports.checkEmails = (check) => {
        assert.equal(ses.emails.length, 1, 'Not exactly one email present!');
        check(ses.emails.pop());
      };
    } else {
      sqs = new aws.SQS(cfg.aws);
      const emailSQSQueue = await sqs.createQueue({
        QueueName: 'taskcluster-notify-test-emails',
      }).promise().then(req => req.QueueUrl);
      let emailAttr = await sqs.getQueueAttributes({
        QueueUrl: emailSQSQueue,
        AttributeNames: ['ApproximateNumberOfMessages', 'QueueArn'],
      }).promise().then(req => req.Attributes);
      if (emailAttr.ApproximateNumberOfMessages !== '0') {
        console.log(`Detected ${emailAttr.ApproximateNumberOfMessages} messages in email queue. Purging.`);
        await sqs.purgeQueue({
          QueueUrl: emailSQSQueue,
        }).promise();
      }

      // Send emails to sqs for testing
      let sns = new aws.SNS(cfg.aws);
      let snsArn = await sns.createTopic({
        Name: 'taskcluster-notify-test',
      }).promise().then(res => res.TopicArn);
      let subscribed = await sns.listSubscriptionsByTopic({
        TopicArn: snsArn,
      }).promise().then(req => {
        for (let subscription of req.Subscriptions) {
          if (subscription.Endpoint === emailAttr.QueueArn) {
            return true;
          }
        }
        return false;
      });
      if (!subscribed) {
        await sns.subscribe({
          Protocol: 'sqs',
          TopicArn: snsArn,
          Endpoint: emailAttr.QueueArn,
        }).promise();
      }

      exports.checkEmails = async (check) => {
        const resp = await sqs.receiveMessage({
          QueueUrl: emailSQSQueue,
          AttributeNames: ['ApproximateReceiveCount'],
          MaxNumberOfMessages: 10,
          VisibilityTimeout: 30,
          WaitTimeSeconds: 20,
        }).promise();
        const messages = resp.Messages;
        await sqs.deleteMessage({
          QueueUrl: emailSQSQueue,
          ReceiptHandle: messages[0].ReceiptHandle,
        }).promise();
        assert.equal(messages.length, 1);
        check(JSON.parse(JSON.parse(messages[0].Body).Message));
      };
    }
  });

  suiteTeardown('withSES', async function() {
    if (skipping()) {
      return;
    }
    if (mock) {
      ses.reset();
    }
  });
};

/**
 * make a queue object with the `task` method stubbed out, and with
 * an `addTask` method to add fake tasks.
 */
const stubbedQueue = () => {
  const tasks = {};
  const queue = new taskcluster.Queue({
    rootUrl: exports.rootUrl,
    credentials: {
      clientId: 'index-server',
      accessToken: 'none',
    },
    fake: {
      task: async (taskId) => {
        const task = tasks[taskId];
        assert(task, `fake queue has no task ${taskId}`);
        return task;
      },
    },
  });

  queue.addTask = function(taskId, task) {
    tasks[taskId] = task;
  };

  return queue;
};

/**
 * Set up a fake tc-queue object that supports only the `task` method,
 * and inject that into the loader.  This is injected regardless of
 * whether we are mocking.
 *
 * The component is available at `helper.queue`.
 */
exports.withFakeQueue = (mock, skipping) => {
  suiteSetup('withFakeQueue', function() {
    if (skipping()) {
      return;
    }

    exports.queue = stubbedQueue();
    exports.load.inject('queue', exports.queue);
  });
};

exports.withPulse = (mock, skipping) => {
  withPulse({helper: exports, skipping, namespace: 'taskcluster-notify'});
};

/**
 * Set up an API server.
 */
exports.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup('withServer', async function() {
    if (skipping()) {
      return;
    }
    await exports.load('cfg');

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);
    exports.load.cfg('taskcluster.clientId', null);
    exports.load.cfg('taskcluster.accessToken', null);
    fakeauth.start(testclients, {rootUrl: exports.rootUrl});

    exports.load.inject('rateLimit', new RateLimit({count: 100, time: 100, noPeriodicPurge: true}));

    exports.NotifyClient = taskcluster.createClient(builder.reference());

    exports.apiClient = new exports.NotifyClient({
      credentials: {
        clientId: 'test-client',
        accessToken: 'doesnt-matter',
      },
      rootUrl: exports.rootUrl,
    });

    webServer = await exports.load('server');
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
    fakeauth.stop();
  });
};

exports.withEntities = (mock, skipping) => {
  withEntity(mock, skipping, exports, 'DenylistedNotification', data.DenylistedNotification);
};
