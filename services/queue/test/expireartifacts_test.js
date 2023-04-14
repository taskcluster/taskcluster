const debug = require('debug')('test:expireTasks');
const slugid = require('slugid');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  const MAX_ARTIFACTS = 5;

  test('expire s3 artifacts', async () => {
    const yesterday = taskcluster.fromNow('-1 day');
    const today = new Date();
    const taskId = slugid.nice();
    const bucket = await helper.load('publicArtifactBucket');

    for (let i = 0; i < MAX_ARTIFACTS; i++) {
      await helper.db.fns.create_queue_artifact(
        taskId,
        i,
        `name-${i}`,
        's3',
        'content-type',
        {
          bucket: 'fake-public',
          prefix: `${taskId}/${i}/log.log`,
        },
        false,
        yesterday,
      );

      // create mock s3 object
      await bucket.s3.putObject({
        Bucket: 'fake-public',
        Key: `${taskId}/${i}/log.log`,
        Body: 'hello',
      }).promise();
    }

    // check that the s3 objects exist
    let objects = await bucket.s3.listObjects({
      Bucket: 'fake-public',
    }).promise();
    assume(objects.Contents.length).equals(MAX_ARTIFACTS);

    let rows = await helper.db.fns.get_expired_artifacts_for_deletion({
      expires_in: today,
      page_size_in: 1000,
    });
    assume(rows.length).equals(MAX_ARTIFACTS);

    debug('### Expire artifacts');
    await helper.runExpiration('expire-artifacts');

    rows = await helper.db.fns.get_expired_artifacts_for_deletion({
      expires_in: today,
      page_size_in: 1000,
    });
    assume(rows.length).equals(0);

    // check that the s3 objects are gone
    objects = await bucket.s3.listObjects({
      Bucket: 'fake-public',
    }).promise();
    assume(objects.Contents.length).equals(0);
  });

  test('expire s3 artifacts but handle missing ones', async () => {
    const yesterday = taskcluster.fromNow('-1 day');
    const today = new Date();
    const taskId = slugid.nice();
    const bucket = await helper.load('publicArtifactBucket');

    const maxUploads = Math.round(MAX_ARTIFACTS / 2);

    for (let i = 0; i < MAX_ARTIFACTS; i++) {
      await helper.db.fns.create_queue_artifact(
        taskId,
        i,
        `name-${i}`,
        's3',
        'content-type',
        {
          bucket: 'fake-public',
          prefix: `${taskId}/${i}/log.log`,
        },
        false,
        yesterday,
      );

      if (i < maxUploads) {
        // create mock s3 object
        await bucket.s3.putObject({
          Bucket: 'fake-public',
          Key: `${taskId}/${i}/log.log`,
          Body: 'hello',
        }).promise();
      }
    }

    // check that the s3 objects exist
    let objects = await bucket.s3.listObjects({
      Bucket: 'fake-public',
    }).promise();
    assume(objects.Contents.length).equals(maxUploads);

    let rows = await helper.db.fns.get_expired_artifacts_for_deletion({
      expires_in: today,
      page_size_in: 1000,
    });
    assume(rows.length).equals(MAX_ARTIFACTS);

    debug('### Expire artifacts');
    await helper.runExpiration('expire-artifacts');

    rows = await helper.db.fns.get_expired_artifacts_for_deletion({
      expires_in: today,
      page_size_in: 1000,
    });
    assume(rows.length).equals(0);

    // check that the s3 objects are gone
    objects = await bucket.s3.listObjects({
      Bucket: 'fake-public',
    }).promise();
    assume(objects.Contents.length).equals(0);
  });

  test('expire non s3 artifacts', async () => {
    const yesterday = taskcluster.fromNow('-1 day');
    const today = new Date();
    const taskId = slugid.nice();

    for (let i = 0; i < MAX_ARTIFACTS; i++) {
      await helper.db.fns.create_queue_artifact(
        taskId,
        i,
        `name-${i}`,
        'something-else',
        'content-type',
        {
          bucket: 'fake-public',
          prefix: `${taskId}/${i}/log.log`,
        },
        false,
        yesterday,
      );
    }

    let rows = await helper.db.fns.get_expired_artifacts_for_deletion({
      expires_in: today,
      page_size_in: 1000,
    });
    assume(rows.length).equals(MAX_ARTIFACTS);

    debug('### Expire artifacts');
    await helper.runExpiration('expire-artifacts');

    rows = await helper.db.fns.get_expired_artifacts_for_deletion({
      expires_in: today,
      page_size_in: 1000,
    });
    assume(rows.length).equals(0);
  });
});
