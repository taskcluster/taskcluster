const AWS = require('aws-sdk');

module.exports = async ({userConfig, answer}) => {
  const iam = new AWS.IAM();
  const s3 = new AWS.S3();
  const prefix = (answer.meta || {}).deploymentPrefix || (userConfig.meta || {}).deploymentPrefix;

  userConfig.queue = userConfig.queue || {};

  // TODO: Add private artifact bucket and both blob buckets
  // TODO: Also set up auth/notify aws stuff

  const queueIamName = `${prefix}-taskcluster-queue`;
  const publicBucketName = `${prefix}-public-artifacts`;

  if (!userConfig.queue.public_artifact_bucket) {
    await s3.createBucket({
      Bucket: publicBucketName,
      ACL: 'public-read',
    }).promise();
    userConfig.queue.public_artifact_bucket = publicBucketName;
  }

  if (!userConfig.queue.aws_access_key_id) {
    try {
      await iam.createUser({
        Path: '/taskcluster-service/',
        UserName: queueIamName,
      }).promise();
    } catch (err) {
      if (err.code !== 'EntityAlreadyExists') {
        throw err;
      }
    }

    await iam.putUserPolicy({
      PolicyDocument: JSON.stringify({
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
            ],
          },
        ],
      }),
      PolicyName: `${queueIamName}-policy`,
      UserName: queueIamName,
    }).promise();

    const {AccessKeyMetadata: existingKeys} = await iam.listAccessKeys({
      UserName: queueIamName,
    }).promise();

    for (const key of existingKeys) {
      await iam.deleteAccessKey({
        UserName: queueIamName,
        AccessKeyId: key.AccessKeyId,
      }).promise();
    }

    const {AccessKey: accessKey} = await iam.createAccessKey({
      UserName: queueIamName,
    }).promise();

    userConfig.queue.aws_access_key_id = accessKey.AccessKeyId;
    userConfig.queue.aws_secret_access_key = accessKey.SecretAccessKey;

    return userConfig;
  }
};
