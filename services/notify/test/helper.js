const assert = require('assert');
const path = require('path');
const _ = require('lodash');
const mocha = require('mocha');
const aws = require('aws-sdk');
const taskcluster = require('taskcluster-client');
const {FakeClient} = require('taskcluster-lib-pulse');
const config = require('typed-env-config');
const {stickyLoader, Secrets, fakeauth} = require('taskcluster-lib-testing');
const builder = require('../src/api');
const exchanges = require('../src/exchanges');
const load = require('../src/main');
const RateLimit = require('../src/ratelimit');

// Load configuration
const cfg = config({profile: 'test'});

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
  exports.load.inject('pulseClient', new FakeClient());
});

// set up the testing secrets
exports.secrets = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-notify',
  secrets: {
    aws: [
      {env: 'AWS_ACCESS_KEY_ID', cfg: 'aws.accessKeyId'},
      {env: 'AWS_SECRET_ACCESS_KEY', cfg: 'aws.secretAccessKey'},
    ],
  },
  load: exports.load,
});

class MockSQS {
  constructor() {
    this.queues = {};
  }

  createQueue({QueueName}) {
    this.queues[QueueName] = [];
    return {promise: async () => ({QueueUrl: QueueName})};
  }

  sendMessage({QueueUrl, MessageBody, DelaySeconds}) {
    this.queues[QueueUrl].unshift(MessageBody);
    return {promise: async () => ({})};
  }

  reset() {
    this.queues = {};
  }
}

exports.withSQS = (mock, skipping) => {
  let sqs;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    const cfg = await exports.load('cfg');

    if (mock) {
      sqs = new MockSQS();
      exports.ircSQSQueue = cfg.app.sqsQueueName;
      exports.load.inject('sqs', sqs);
      exports.checkSQSMessage = (queueUrl, check) => {
        const messages = sqs.queues[queueUrl];
        assert(messages, `Queue "${queueUrl}" not yet created.`);
        assert(messages.length > 0, `Queue "${queueUrl}" has too few messages.`);
        assert(messages.length === 1, `Queue "${queueUrl}" has too many messages.`);
        check(JSON.parse(messages.pop()));
      };
    } else {
      sqs = await exports.load('sqs');
      const notifier = await exports.load('notifier');
      exports.ircSQSQueue = await notifier.queueUrl;
      let approxLen = await sqs.getQueueAttributes({
        QueueUrl: exports.ircSQSQueue,
        AttributeNames: ['ApproximateNumberOfMessages'],
      }).promise().then(req => req.Attributes.ApproximateNumberOfMessages);
      if (approxLen !== '0') {
        console.log(`Detected ${approxLen} messages in irc queue. Purging.`);
        await sqs.purgeQueue({
          QueueUrl: exports.ircSQSQueue,
        }).promise();
      }
      exports.checkSQSMessage = async (queueUrl, check) => {
        const resp = await  sqs.receiveMessage({
          QueueUrl:             queueUrl,
          AttributeNames:       ['ApproximateReceiveCount'],
          MaxNumberOfMessages:  10,
          VisibilityTimeout:    30,
          WaitTimeSeconds:      20,
        }).promise();
        const messages = resp.Messages;
        await sqs.deleteMessage({
          QueueUrl:       queueUrl,
          ReceiptHandle:  messages[0].ReceiptHandle,
        }).promise();
        assert.equal(messages.length, 1);
        check(JSON.parse(messages[0].Body));
      };
    }
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    if (mock) {
      sqs.reset();
    }
  });
};

class MockSES {
  constructor() {
    this.emails = [];
  }

  sendRawEmail(c, callback) {
    this.emails.push({
      delivery: {recipients: c.Destinations},
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

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    const cfg = await exports.load('cfg');

    if (mock) {
      ses = new MockSES();
      exports.load.inject('ses', ses);
      exports.checkEmails = (check) => {
        assert(ses.emails.length === 1, `Not exactly one email present! (${ses.emails.length})`);
        check(ses.emails.pop());
      };
    } else {
      sqs = await exports.load('sqs');
      const emailSQSQueue = await sqs.createQueue({
        QueueName:  'taskcluster-notify-test-emails',
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
        const resp = await  sqs.receiveMessage({
          QueueUrl:             emailSQSQueue,
          AttributeNames:       ['ApproximateReceiveCount'],
          MaxNumberOfMessages:  10,
          VisibilityTimeout:    30,
          WaitTimeSeconds:      20,
        }).promise();
        const messages = resp.Messages;
        await sqs.deleteMessage({
          QueueUrl:       emailSQSQueue,
          ReceiptHandle:  messages[0].ReceiptHandle,
        }).promise();
        assert.equal(messages.length, 1);
        check(JSON.parse(JSON.parse(messages[0].Body).Message));
      };
    }
  });

  suiteTeardown(async function() {
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
    credentials:      {
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
  suiteSetup(function() {
    if (skipping()) {
      return;
    }

    exports.queue = stubbedQueue();
    exports.load.inject('queue', exports.queue);
  });
};

/**
 * Set up PulsePublisher in fake mode, at helper.publisher. Messages are stored
 * in helper.messages.  The `helper.checkNextMessage` function allows asserting the
 * content of the next message, and `helper.checkNoNextMessage` is an assertion that
 * no such message is in the queue.
 */
exports.withPulse = (mock, skipping) => {
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    await exports.load('cfg');
    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);
    exports.publisher = await exports.load('publisher');

    exports.checkNextMessage = (exchange, check) => {
      for (let i = 0; i < exports.messages.length; i++) {
        const message = exports.messages[i];
        // skip messages for other exchanges; this allows us to ignore
        // ordering of messages that occur in indeterminate order
        if (!message.exchange.endsWith(exchange)) {
          continue;
        }
        check && check(message);
        exports.messages.splice(i, 1); // delete message from queue
        return;
      }
      throw new Error(`No messages found on exchange ${exchange}; ` +
        `message exchanges: ${JSON.stringify(exports.messages.map(m => m.exchange))}`);
    };

    exports.checkNoNextMessage = exchange => {
      assert(!exports.messages.some(m => m.exchange.endsWith(exchange)));
    };
  });

  const fakePublish = msg => { exports.messages.push(msg); };
  setup(function() {
    exports.messages = [];
    exports.publisher.on('message', fakePublish);
  });

  teardown(function() {
    exports.publisher.removeListener('message', fakePublish);
  });
};

exports.withHandler = (mock, skipping) => {
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    const handler = await exports.load('handler');
    exports.handler = handler;
    exports.pq = handler.pq;
  });
};

/**
 * Set up an API server.
 */
exports.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    const cfg = await exports.load('cfg');

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
        clientId:       'test-client',
        accessToken:    'doesnt-matter',
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
