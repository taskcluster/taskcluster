module "queue_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-queue"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

module "queue_user" {
  source = "./modules/taskcluster-service-iam-user"
  name   = "taskcluster-queue"
  prefix = "${var.prefix}"

  policy = <<EOF
{
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
                "s3:DeleteObject"
            ],
            "Resource": [
              "${aws_s3_bucket.public_blobs.arn}/*",
              "${aws_s3_bucket.private_blobs.arn}/*",
              "${aws_s3_bucket.public_artifacts.arn}/*",
              "${aws_s3_bucket.private_artifacts.arn}/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetBucketLocation",
                "s3:GetBucketTagging",
                "s3:ListBucket",
                "s3:PutBucketCORS",
                "s3:GetBucketCORS"
            ],
            "Resource": [
              "${aws_s3_bucket.public_blobs.arn}",
              "${aws_s3_bucket.private_blobs.arn}",
              "${aws_s3_bucket.public_artifacts.arn}",
              "${aws_s3_bucket.private_artifacts.arn}"
            ]
        }
    ]
}
EOF
}


