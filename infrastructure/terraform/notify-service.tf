module "notify_user" {
  source = "modules/taskcluster-service-iam-user"
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
                "ses:FromAddress": "${local.email_source_address}"
              }
            }
        }
    ]
}
EOF
}


