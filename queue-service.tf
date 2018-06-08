module "queue_user" {
  source = "modules/taskcluster-service-iam-user"
  name   = "taskcluster-queue"

  policy = <<EOF
{
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListMultipartUploadParts",
                "s3:AbortMultipartUpload",
                "s3:PutObjectTagging",
                "s3:GetObjectTagging",
                "s3:DeleteObjectTagging"
            ],
            "Resource": [
              "${aws_s3_bucket.public_blobs.arn}"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:GetBucketLocation",
                "s3:ListBucket",
                "s3:PutBucketCORS"
            ],
            "Resource": [
              "${aws_s3_bucket.public_artifacts.arn}",
              "${aws_s3_bucket.private_artifacts.arn}"
            ]
        }
    ]
}
EOF
}

module "queue_secrets" {
  source       = "modules/service-secrets"
  project_name = "taskcluster-queue"

  secrets = {
    AWS_ACCESS_KEY_ID     = "${module.queue_user.access_key_id}"
    AWS_SECRET_ACCESS_KEY = "${module.queue_user.secret_access_key}"
  }
}
