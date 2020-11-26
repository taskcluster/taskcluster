/**
 * The given AWS credentials should have the following policy allowing access
 * to the test bucket:
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "Stmt1462988481000",
            "Effect": "Allow",
            "Action": [
                "s3:GetBucketCORS",
                "s3:PutBucketCORS",
                "s3:DeleteObject",
                "s3:GetObject",
                "s3:PutObject",
                "s3:PutObjectAcl",
                "s3:ListBucket",
                "s3:GetBucketLocation",
                "s3:GetObjectTagging",
                "s3:ListMultipartUploadParts",
                "s3:AbortMultipartUpload",
                "s3:PutObjectTagging"
            ],
            "Resource": [
                "arn:aws:s3:::$AWS_TEST_BUCKET",  <-- fill in the bucket name here
                "arn:aws:s3:::$AWS_TEST_BUCKET/*"
            ]
        }
    ]
}
*
* The bucket should default to publicly-readable objects,and with a
* lifecycle policy that deletes objects after 1 day, to avoid collecting
* any "cruft" from test runs.
*/
exports.secret = [
  { env: 'AWS_ACCESS_KEY_ID', name: 'accessKeyId' },
  { env: 'AWS_SECRET_ACCESS_KEY', name: 'secretAccessKey' },
  { env: 'AWS_TEST_BUCKET', name: 'testBucket' },
];
