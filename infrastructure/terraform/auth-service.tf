data "aws_caller_identity" "current" {}

module "auth_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-auth"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

module "auth_user" {
  source = "modules/taskcluster-service-iam-user"
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
