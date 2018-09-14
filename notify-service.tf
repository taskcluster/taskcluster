resource "aws_sqs_queue" "notify_irc_queue" {
  name = "tasklcuster-notify-irc"
}

locals {
  email_source_address = "${element(split("identity/", var.notify_ses_arn), 1)}"
}

module "notify_user" {
  source = "modules/taskcluster-service-iam-user"
  name   = "taskcluster-notify"

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
                "ses:SendEmail"
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

module "notify_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  project_name   = "taskcluster-notify"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

resource "random_string" "notify_access_token" {
  length           = 65
  override_special = "_-"
}

module "notify_secrets" {
  source       = "modules/service-secrets"
  project_name = "taskcluster-notify"

  secrets = {
    AWS_ACCESS_KEY_ID        = "${module.notify_user.access_key_id}"
    AWS_SECRET_ACCESS_KEY    = "${module.notify_user.secret_access_key}"
    AWS_REGION               = "us-east-1"                                   // TODO: Make this come from tf
    TASKCLUSTER_CLIENT_ID    = "static/taskcluster/secrets"
    TASKCLUSTER_ACCESS_TOKEN = "${random_string.notify_access_token.result}"
    DEBUG                    = "*"
    FORCE_SSL                = "false"
    TRUST_PROXY              = "true"
    NODE_ENV                 = "production"
    MONITORING_ENABLE        = "false"
    PUBLISH_METADATA         = "false"
    PULSE_USERNAME           = "taskcluster-notify"
    PULSE_PASSWORD           = "${module.notify_rabbitmq_user.password}"
    PULSE_HOSTNAME           = "${var.rabbitmq_hostname}"
    PULSE_VHOST              = "${var.rabbitmq_vhost}"
    EMAIL_BLACKLIST          = "[]"
    EMAIL_SOURCE_ADDRESS     = "${local.email_source_address}"
    SQS_QUEUE                = "${aws_sqs_queue.notify_irc_queue.name}"
    IRC_USER_NAME            = "${var.irc_name}"
    IRC_REAL_NAME            = "${var.irc_real_name}"
    IRC_NICK                 = "${var.irc_nick}"
    IRC_PORT                 = "${var.irc_port}"
    IRC_SERVER               = "${var.irc_server}"
    IRC_PASSWORD             = "${var.irc_password}"
  }
}

module "notify_web_service" {
  source         = "modules/deployment"
  project_name   = "taskcluster-notify"
  service_name   = "notify"
  proc_name      = "web"
  readiness_path = "/api/notify/v1/ping"
  secret_name    = "${module.notify_secrets.secret_name}"
  secrets_hash   = "${module.notify_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.notify_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_notify}"
}

module "notify_handler" {
  source         = "modules/deployment"
  project_name   = "taskcluster-notify"
  service_name   = "notify"
  proc_name      = "handler"
  background_job = true
  secret_name    = "${module.notify_secrets.secret_name}"
  secrets_hash   = "${module.notify_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.notify_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_notify}"
}

module "notify_irc" {
  source         = "modules/deployment"
  project_name   = "taskcluster-notify"
  service_name   = "notify"
  proc_name      = "irc"
  background_job = true
  secret_name    = "${module.notify_secrets.secret_name}"
  secrets_hash   = "${module.notify_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.notify_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_notify}"
}
