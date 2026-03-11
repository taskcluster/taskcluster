import _ from 'lodash';
import {
  IAMClient,
  CreateAccessKeyCommand,
  CreateUserCommand,
  DeleteAccessKeyCommand,
  EntityAlreadyExistsException,
  ListAccessKeysCommand,
  PutUserPolicyCommand,
} from '@aws-sdk/client-iam';
import {
  S3Client,
  CreateBucketCommand,
  GetBucketLocationCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';

const setupIam = async ({ iam = new IAMClient(), iamName, iamPolicy }) => {
  try {
    await iam.send(new CreateUserCommand({
      Path: '/taskcluster-service/',
      UserName: iamName,
    }));
  } catch (err) {
    if (err instanceof EntityAlreadyExistsException) {
      throw err;
    }
  }

  await iam.send(new PutUserPolicyCommand({
    PolicyDocument: JSON.stringify(iamPolicy),
    PolicyName: `${iamName}-policy`,
    UserName: iamName,
  }));

  const { AccessKeyMetadata: existingKeys } = await iam.send(new ListAccessKeysCommand({
    UserName: iamName,
  }));

  for (const key of existingKeys) {
    await iam.send(new DeleteAccessKeyCommand({
      UserName: iamName,
      AccessKeyId: key.AccessKeyId,
    }));
  }

  const { AccessKey: accessKey } = await iam.send(new CreateAccessKeyCommand({
    UserName: iamName,
  }));

  return accessKey;
};

export default async ({ userConfig, answer, configTmpl }) => {
  const iam = new IAMClient();
  const s3 = new S3Client();
  const prefix = answer.meta?.deploymentPrefix || userConfig.meta?.deploymentPrefix;

  userConfig.queue = userConfig.queue || {};
  userConfig.meta = userConfig.meta || {};

  const publicBucketName = `${prefix}-public-artifacts`;
  const privateBucketName = `${prefix}-private-artifacts`;

  if (!userConfig.queue.public_artifact_bucket) {
    await s3.send(new CreateBucketCommand({
      Bucket: publicBucketName,
      ACL: 'public-read',
    }));
    userConfig.queue.public_artifact_bucket = publicBucketName;
  }

  if (!userConfig.queue.artifact_region) {
    const { LocationConstraint } = await s3.send(new GetBucketLocationCommand({
      Bucket: publicBucketName,
    }));
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
    await s3.send(new PutBucketPolicyCommand({
      Bucket: publicBucketName,
      Policy: JSON.stringify(publicPolicy),
    }));
    userConfig.meta.lastAppliedPublicBucketPolicy = publicPolicy;
  }

  if (!userConfig.queue.private_artifact_bucket) {
    await s3.send(new CreateBucketCommand({
      Bucket: privateBucketName,
      ACL: 'private',
    }));
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
