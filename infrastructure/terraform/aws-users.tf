data "aws_caller_identity" "current" {}

module "auth_user" {
  source = "./modules/taskcluster-service-iam-user"
  name   = "taskcluster-auth"
  prefix = "${var.prefix}"

  policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "sts:GetFederationToken",
            "Resource": "arn:aws:sts::${data.aws_caller_identity.current.account_id}:federated-user/TemporaryS3ReadWriteCredentials"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:DeleteObject",
                "s3:GetObject",
                "s3:PutObject",
                "s3:PutObjectAcl",
                "s3:ListBucket",
                "s3:GetBucketLocation"
            ],
            "Resource": [
              "${aws_s3_bucket.backups.arn}",
              "${aws_s3_bucket.backups.arn}/*"
            ]
        }
    ]
}
EOF
}

resource "aws_sqs_queue" "notify_irc_queue" {
  name = "${var.prefix}-notify-irc"
}

module "notify_user" {
  source = "./modules/taskcluster-service-iam-user"
  name   = "taskcluster-notify"
  prefix = "${var.prefix}"

  policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
              "sqs:CreateQueue",
              "sqs:GetQueueUrl",
              "sqs:ReceiveMessage",
              "sqs:SendMessage",
              "sqs:DeleteMessage"
            ],
            "Resource": [
              "${aws_sqs_queue.notify_irc_queue.arn}"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "ses:SendEmail",
                "ses:SendRawEmail"
            ],
            "Resource": "*",
            "Condition": {
              "StringEquals": {
                "ses:FromAddress": "${var.email_source_address}"
              }
            }
        }
    ]
}
EOF
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
