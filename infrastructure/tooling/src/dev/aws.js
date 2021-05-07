const _ = require('lodash');
const AWS = require('aws-sdk');

const setupIam = async ({ iam, iamName, iamPolicy }) => {
  try {
    await iam.createUser({
      Path: '/taskcluster-service/',
      UserName: iamName,
    }).promise();
  } catch (err) {
    if (err.code !== 'EntityAlreadyExists') {
      throw err;
    }
  }
  await iam.putUserPolicy({
    PolicyDocument: JSON.stringify(iamPolicy),
    PolicyName: `${iamName}-policy`,
    UserName: iamName,
  }).promise();

  const { AccessKeyMetadata: existingKeys } = await iam.listAccessKeys({
    UserName: iamName,
  }).promise();

  for (const key of existingKeys) {
    await iam.deleteAccessKey({
      UserName: iamName,
      AccessKeyId: key.AccessKeyId,
    }).promise();
  }

  const { AccessKey: accessKey } = await iam.createAccessKey({
    UserName: iamName,
  }).promise();

  return accessKey;
};

module.exports = async ({ userConfig, answer, configTmpl }) => {
  const iam = new AWS.IAM();
  const s3 = new AWS.S3();
  const prefix = answer.meta?.deploymentPrefix || userConfig.meta?.deploymentPrefix;

  userConfig.queue = userConfig.queue || {};
  userConfig.meta = userConfig.meta || {};

  const publicBucketName = `${prefix}-public-artifacts`;
  const privateBucketName = `${prefix}-private-artifacts`;

  if (!userConfig.queue.public_artifact_bucket) {
    await s3.createBucket({
      Bucket: publicBucketName,
      ACL: 'public-read',
    }).promise();
    userConfig.queue.public_artifact_bucket = publicBucketName;
  }

  if (!userConfig.queue.artifact_region) {
    const { LocationConstraint } = await s3.getBucketLocation({
      Bucket: publicBucketName,
    }).promise();
    const region = LocationConstraint === '' ? 'us-east-1' : LocationConstraint;
    userConfig.queue.artifact_region = region;
  }

  const publicPolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: "PublicReadGetObject",
        Effect: "Allow",
        Principal: {
          AWS: "*",
        },
        Action: "s3:GetObject",
        Resource: `arn:aws:s3:::${publicBucketName}/*`,
      },
    ],
  };
  if (!userConfig.meta.lastAppliedPublicBucketPolicy ||
      !_.isEqual(userConfig.meta.lastAppliedPublicBucketPolicy, publicPolicy)) {
    await s3.putBucketPolicy({
      Bucket: publicBucketName,
      Policy: JSON.stringify(publicPolicy),
    }).promise();
    userConfig.meta.lastAppliedPublicBucketPolicy = publicPolicy;
  }

  if (!userConfig.queue.private_artifact_bucket) {
    await s3.createBucket({
      Bucket: privateBucketName,
      ACL: 'private',
    }).promise();
    userConfig.queue.private_artifact_bucket = privateBucketName;
  }

  if (!userConfig.queue.aws_access_key_id) {
    const accessKey = await setupIam({
      iam,
      iamName: `${prefix}-taskcluster-queue`,
      iamPolicy: {
        "Statement": [
          {
            "Effect": "Allow",
            "Action": [
              "s3:GetObject",
              "s3:GetObjectTagging",
              "s3:PutObject",
              "s3:PutObjectTagging",
              "s3:AbortMultipartUpload",
              "s3:ListMultipartUploadParts",
              "s3:DeleteObject",
            ],
            "Resource": [
              `arn:aws:s3:::${publicBucketName}/*`,
              `arn:aws:s3:::${privateBucketName}/*`,
            ],
          },
          {
            "Effect": "Allow",
            "Action": [
              "s3:GetBucketLocation",
              "s3:GetBucketTagging",
              "s3:ListBucket",
              "s3:PutBucketCORS",
              "s3:GetBucketCORS",
            ],
            "Resource": [
              `arn:aws:s3:::${publicBucketName}`,
              `arn:aws:s3:::${privateBucketName}`,
            ],
          },
        ],
      },
    });

    userConfig.queue.aws_access_key_id = accessKey.AccessKeyId;
    userConfig.queue.aws_secret_access_key = accessKey.SecretAccessKey;
  }

  if (!userConfig.notify || !userConfig.notify.aws_access_key_id) {
    const accessKey = await setupIam({
      iam,
      iamName: `${prefix}-taskcluster-notify`,
      iamPolicy: {
        "Statement": [
          {
            "Effect": "Allow",
            "Action": [
              "ses:SendEmail",
              "ses:SendRawEmail",
            ],
            "Resource": "*",
            "Condition": {
              "StringEquals": {
                "ses:FromAddress": `${(answer.notify || {}).email_source_address || userConfig.notify.email_source_address}`,
              },
            },
          },
        ],
      },
    });

    if (!userConfig.notify) {
      userConfig.notify = {};
    }
    userConfig.notify.aws_access_key_id = accessKey.AccessKeyId;
    userConfig.notify.aws_secret_access_key = accessKey.SecretAccessKey;
  }

  return userConfig;
};
