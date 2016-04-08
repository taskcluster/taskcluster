var api = require('./v1');

api.declare({
  method:     'get',
  route:      '/aws/s3/:level/:bucket/:prefix(*)',
  name:       'awsS3Credentials',
  input:      undefined,
  output:     'aws-s3-credentials-response.json#',
  deferAuth:  true,
  stability:  'stable',
  scopes:     [['auth:aws-s3:<level>:<bucket>/<prefix>']],
  title:      "Get Temporary Read/Write Credentials S3",
  description: [
    "Get temporary AWS credentials for `read-write` or `read-only` access to",
    "a given `bucket` and `prefix` within that bucket.",
    "The `level` parameter can be `read-write` or `read-only` and determines",
    "which type of credentials are returned. Please note that the `level`",
    "parameter is required in the scope guarding access.",
    "",
    "The credentials are set to expire after an hour, but this behavior is",
    "subject to change. Hence, you should always read the `expires` property",
    "from the response, if you intend to maintain active credentials in your",
    "application.",
    "",
    "Please note that your `prefix` may not start with slash `/`. Such a prefix",
    "is allowed on S3, but we forbid it here to discourage bad behavior.",
    "",
    "Also note that if your `prefix` doesn't end in a slash `/`, the STS",
    "credentials may allow access to unexpected keys, as S3 does not treat",
    "slashes specially.  For example, a prefix of `my-folder` will allow",
    "access to `my-folder/file.txt` as expected, but also to `my-folder.txt`,",
    "which may not be intended."

  ].join('\n')
}, async function(req, res) {
  var level   = req.params.level;
  var bucket  = req.params.bucket;
  var prefix  = req.params.prefix;

  // Validate that a proper value was given for level
  if (level !== 'read-write' && level !== 'read-only') {
    return res.status(400).json({
      message:      "the 'level' URL parameter must be read-only or read-write",
      levelGiven:   level
    });
  }

  // Check that the client is authorized to access given bucket and prefix
  if (!req.satisfies({
    level:      level,
    bucket:     bucket,
    prefix:     prefix
  })) {
    return;
  }

  // Prevent prefix to start with a slash, this is bad behavior. Technically
  // we could easily support it, S3 does, but people rarely wants double
  // slashes in their URIs intentionally.
  if (prefix[0] === '/') {
    return res.status(400).json({
      message:      "The `prefix` may not start with a slash `/`",
      prefix:       prefix
    });
  }

  // Decide actions to be allowed on S3 objects
  var objectActions = [
    's3:GetObject'
  ];
  if (level === 'read-write') {
    objectActions.push(
      's3:PutObject',
      's3:DeleteObject'
    );
  }

  // For details on the policy see: http://amzn.to/1ETStaL
  var iamReq = await this.sts.getFederationToken({
    Name:               'TemporaryS3ReadWriteCredentials',
    Policy:             JSON.stringify({
      Version:          '2012-10-17',
      Statement:[
        {
          Sid:            'ReadWriteObjectsUnderPrefix',
          Effect:         'Allow',
          Action:         objectActions,
          Resource: [
            'arn:aws:s3:::{{bucket}}/{{prefix}}*'
              .replace('{{bucket}}', bucket)
              .replace('{{prefix}}', prefix)
          ]
        }, {
          Sid:            'ListObjectsUnderPrefix',
          Effect:         'Allow',
          Action: [
            's3:ListBucket'
          ],
          Resource: [
            'arn:aws:s3:::{{bucket}}'
              .replace('{{bucket}}', bucket)
          ],
          Condition: {
            StringLike: {
              's3:prefix': [
                '{{prefix}}*'.replace('{{prefix}}', prefix)
              ]
            }
          }
        }, {
          Sid:            'GetBucketLocation',
          Effect:         'Allow',
          Action: [
            's3:GetBucketLocation'
          ],
          Resource: [
            'arn:aws:s3:::{{bucket}}'
              .replace('{{bucket}}', bucket)
          ]
        }
      ]
    }),
    DurationSeconds:    60 * 60   // Expire credentials in an hour
  }).promise();

  return res.reply({
    credentials: {
      accessKeyId:      iamReq.data.Credentials.AccessKeyId,
      secretAccessKey:  iamReq.data.Credentials.SecretAccessKey,
      sessionToken:     iamReq.data.Credentials.SessionToken
    },
    expires:            new Date(iamReq.data.Credentials.Expiration).toJSON()
  });
});
