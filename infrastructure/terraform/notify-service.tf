resource "aws_sqs_queue" "notify_irc_queue" {
  name = "${var.prefix}-notify-irc"
}

module "notify_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-notify"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
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


