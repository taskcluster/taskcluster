const _ = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const Entity = require('taskcluster-lib-entities');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/notify/src/data.js)
const DenylistedNotification = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('notificationType'),
  rowKey: Entity.keys.StringKey('notificationAddress'),
  properties: {
    // the type could be email, pulse, irc-user or irc-channel
    notificationType: Entity.types.String,
    // the address of the denylisted destination
    notificationAddress: Entity.types.String,
  },
});

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('denylisted_notifications table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('denylisted_notification_entities');
    await helper.assertNoTable('denylisted_notifications');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('denylisted_notifications');
    await helper.assertNoTable('denylisted_notification_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('denylisted_notification_entities');
    await helper.assertNoTable('denylisted_notifications');
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'notify',
    entityTableName: 'denylisted_notification_entities',
    newTableName: 'denylisted_notifications',
    EntityClass: DenylistedNotification,
    samples: {
      ...Object.fromEntries(_.range(3).map(i => ([
        `email${i}`, {
          notificationType: 'email',
          notificationAddress: `pmoore${i}@mozilla.com`,
        }]))),
      ...Object.fromEntries(_.range(3).map(i => ([
        `irc-user${i}`, {
          notificationType: 'irc-user',
          notificationAddress: `pmoore${i}`,
        }]))),
      ...Object.fromEntries(_.range(3).map(i => ([
        `pulse${i}`, {
          notificationType: 'pulse',
          notificationAddress: `routing.key.pmoore.${i}`,
        }]))),
    },
    loadConditions: [
      {condition: {notificationType: 'email', notificationAddress: 'pmoore2@mozilla.com'}, expectedSample: 'email2'},
      {condition: {notificationType: 'irc-user', notificationAddress: 'pmoore2'}, expectedSample: 'irc-user2'},
      {condition: {notificationType: 'pulse', notificationAddress: 'routing.key.pmoore.2'}, expectedSample: 'pulse2'},
    ],
    scanConditions: [
      {condition: {}, expectedSamples: ['email0', 'email1', 'email2', 'irc-user0', 'irc-user1', 'irc-user2', 'pulse0', 'pulse1', 'pulse2']},
      {condition: null, expectedSamples: ['email0', 'email1', 'email2', 'irc-user0', 'irc-user1', 'irc-user2', 'pulse0', 'pulse1', 'pulse2']},
    ],
    notFoundConditions: [
      {condition: {notificationType: 'notme', notificationAddress: 'itwashim'}},
    ],
    notImplemented: ['create-overwrite', 'remove-ignore-if-not-exists'],
    modifications: [],
  });
});
