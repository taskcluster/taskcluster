// TODO: This service pretty much won't work yet. The aws things need some work
//       but also the service itself needs some assumptions changed in config.yml
// TODO: Probably need to tell people to manually set up
//       an email sender in aws. there is no terraform way to do this.
// TODO: Need to actually get the correct arn's for the following resources
/*
resource "aws_sqs_queue" "notify_irc_queue" {
  name = "tasklcuster-notify-irc"
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
              "arn:aws:sqs:us-east-2:*:taskcluster-notify-*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "ses:SendEmail"
            ],
            "Resource": [
              "arn:aws:ses:us-east-2:<account>:identity/taskcluster-noreply@something.com"
            ]
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
    EMAIL_BLACKLIST          = "[]"
    EMAIL_SOURCE_ADDRESS     = "\"${var.cluster_name}\" <TODO: ???>"
    IRC_PASSWORD             = "TODO"
    SQS_QUEUE                = "TODO"
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
*/

