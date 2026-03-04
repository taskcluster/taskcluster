import assert from 'assert';
import path from 'path';
import {
  SESv2Client,
  SendEmailCommand,
} from '@aws-sdk/client-sesv2';
import {
  SNSClient,
  CreateTopicCommand,
  ListSubscriptionsByTopicCommand,
  SubscribeCommand,
} from '@aws-sdk/client-sns';
import {
  SQSClient,
  CreateQueueCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';
import taskcluster from '@taskcluster/client';
import testing from '@taskcluster/lib-testing';
import builder from '../src/api.js';
import mainLoad from '../src/main.js';
import RateLimit from '../src/ratelimit.js';
import debugFactory from 'debug';
const debug = debugFactory('test');
import sinon from 'sinon';

const testclients = {
  'test-client': ['*'],
  'test-server': ['*'],
};

const suiteName = path.basename;
const rootUrl = 'http://localhost:60401';
const load = testing.stickyLoader(mainLoad);

const helper = { load, rootUrl, suiteName };
export default helper;

suiteSetup(async function() {
  load.inject('profile', 'test');
  load.inject('process', 'test');
});

testing.withMonitor(helper);

// set up the testing secrets
helper.secrets = new testing.Secrets({
  secretName: [
    'project/taskcluster/testing/taskcluster-notify',
  ],
  secrets: {
    aws: [
      { env: 'AWS_ACCESS_KEY_ID', cfg: 'aws.accessKeyId' },
      { env: 'AWS_SECRET_ACCESS_KEY', cfg: 'aws.secretAccessKey' },
    ],
  },
  load: load,
});

/**
 * Define a fake denier that will deny anything with 'denied' in the address
 */
helper.withDenier = (mock, skipping) => {
  suiteSetup('withDenier', async function() {
    if (skipping()) {
      return;
    }

    load.inject('denier', {
      isDenied: async (notificationType, notificationAddress) =>
        /denied/.test(notificationAddress),
    });
  });
};

helper.withSES = (mock, skipping) => {
  let ses;
  let sqs;

  suiteSetup('withSES', async function() {
    if (skipping()) {
      return;
    }

    const cfg = await load('cfg');

    if (mock) {
      ses = mockClient(SESv2Client);
      ses.emails = [];
      ses
        .on(SendEmailCommand)
        .callsFake(async (c) => {
          ses.emails.push({
            delivery: { recipients: c.Destination.ToAddresses },
            data: c.Content.Raw.Data.toString(),
          });
          return { MessageId: 'a-message' };
        });
      load.inject('ses', ses);

      helper.checkEmails = (check) => {
        assert.equal(ses.emails.length, 1, 'Not exactly one email present!');
        check(ses.emails.pop());
      };
    } else {
      sqs = new SQSClient({
        credentials: {
          accessKeyId: cfg.aws.accessKeyId,
          secretAccessKey: cfg.aws.secretAccessKey,
        },
        region: cfg.aws.region || 'us-east-1',
      });
      const { QueueUrl: emailSQSQueue } = await sqs.send(new CreateQueueCommand({
        QueueName: 'taskcluster-notify-test-emails',
      }));
      const { Attributes: emailAttr } = await sqs.send(new GetQueueAttributesCommand({
        QueueUrl: emailSQSQueue,
        AttributeNames: ['ApproximateNumberOfMessages', 'QueueArn'],
      }));
      if (emailAttr.ApproximateNumberOfMessages !== '0') {
        debug(`Detected ${emailAttr.ApproximateNumberOfMessages} messages in email queue. Purging.`);
        await sqs.send(new PurgeQueueCommand({
          QueueUrl: emailSQSQueue,
        }));
      }

      // Send emails to sqs for testing
      let sns = new SNSClient({
        credentials: {
          accessKeyId: cfg.aws.accessKeyId,
          secretAccessKey: cfg.aws.secretAccessKey,
        },
        region: cfg.aws.region || 'us-east-1',
      });
      const { TopicArn: snsArn } = await sns.send(new CreateTopicCommand({
        Name: 'taskcluster-notify-test',
      }));
      const { Subscriptions: subscriptions } = await sns.send(new ListSubscriptionsByTopicCommand({
        TopicArn: snsArn,
      }));
      const subscribed = subscriptions.some(subscription => subscription.Endpoint === emailAttr.QueueArn);
      if (!subscribed) {
        await sns.send(new SubscribeCommand({
          Protocol: 'sqs',
          TopicArn: snsArn,
          Endpoint: emailAttr.QueueArn,
        }));

        // This policy allows the SNS topic subscription to send messages to
        // the SQS queue.  The AWS Console adds a policy automatically when you
        // click "subscribe", and this merely duplicates that policy.
        const Policy = {
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "Sid1573761323466",
              Effect: "Allow",
              Principal: { AWS: "*" },
              Action: "SQS:SendMessage",
              Resource: emailAttr.QueueArn,
              Condition: {
                ArnEquals: {
                  "aws:SourceArn": snsArn,
                },
              },
            },
          ],
        };
        await sqs.send(new SetQueueAttributesCommand({
          QueueUrl: emailSQSQueue,
          Attributes: {
            Policy,
          },
        }));
      }

      helper.checkEmails = async (check) => {
        const resp = await sqs.send(new ReceiveMessageCommand({
          QueueUrl: emailSQSQueue,
          AttributeNames: ['ApproximateReceiveCount'],
          MaxNumberOfMessages: 10,
          VisibilityTimeout: 30,
          WaitTimeSeconds: 20,
        }));
        const messages = resp.Messages || [];
        for (let message of messages) {
          await sqs.send(new DeleteMessageCommand({
            QueueUrl: emailSQSQueue,
            ReceiptHandle: message.ReceiptHandle,
          }));
        }
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
      ses.restore();
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
    rootUrl: rootUrl,
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
helper.withFakeQueue = (mock, skipping) => {
  suiteSetup('withFakeQueue', function() {
    if (skipping()) {
      return;
    }

    helper.queue = stubbedQueue();
    load.inject('queue', helper.queue);
  });
};

const fakeMatrixSend = () => sinon.fake(roomId => {
  if (roomId.includes('rejected')) {
    const err = new Error('rejected this room');
    err.errcode = 'M_FORBIDDEN';
    throw err;
  }
});

helper.withFakeMatrix = (mock, skipping) => {
  suiteSetup('withFakeMatrix', function() {
    if (skipping()) {
      return;
    }

    helper.matrixClient = {
      sendEvent: fakeMatrixSend(),
    };

    load.inject('matrixClient', helper.matrixClient);
  });

  setup(function() {
    helper.matrixClient.sendEvent = fakeMatrixSend();
  });
};

helper.withFakeSlack = (mock, skipping) => {
  const fakeSlackSend = () => sinon.fake(() => ({ ok: true }));

  suiteSetup('withFakeSlack', async function() {
    if (skipping()) {
      return;
    }

    helper.slackClient = {
      chat: {
        postMessage: fakeSlackSend(),
      },
    };

    load.inject('slackClient', helper.slackClient);
  });

  setup(function() {
    helper.slackClient.chat.postMessage = fakeSlackSend();
  });
};

helper.withPulse = (mock, skipping) => {
  testing.withPulse({ helper, skipping, namespace: 'taskcluster-notify' });
};

/**
 * Set up an API server.
 */
helper.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup('withServer', async function() {
    if (skipping()) {
      return;
    }
    await load('cfg');

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    load.cfg('taskcluster.rootUrl', rootUrl);
    load.cfg('taskcluster.clientId', null);
    load.cfg('taskcluster.accessToken', null);
    testing.fakeauth.start(testclients, { rootUrl: rootUrl });

    load.inject('rateLimit', new RateLimit({ count: 100, time: 100, noPeriodicPurge: true }));

    helper.NotifyClient = taskcluster.createClient(builder.reference());

    helper.apiClient = new helper.NotifyClient({
      credentials: {
        clientId: 'test-client',
        accessToken: 'doesnt-matter',
      },
      retries: 0,
      rootUrl,
    });

    webServer = await load('server');
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
    testing.fakeauth.stop();
  });
};

helper.withDb = (mock, skipping) => {
  testing.withDb(mock, skipping, helper, 'notify');
};

helper.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await testing.resetTables({ tableNames: [
      'denylisted_notifications',
    ] });
  });
};
