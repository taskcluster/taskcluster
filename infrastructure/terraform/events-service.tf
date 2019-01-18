module "events_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-events"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

resource "random_string" "events_access_token" {
  length           = 65
  override_special = "_-"
}

module "events_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-events"
  disabled_services = "${var.disabled_services}"

  secrets = {
    TASKCLUSTER_CLIENT_ID    = "static/taskcluster/events"
    TASKCLUSTER_ACCESS_TOKEN = "${random_string.events_access_token.result}"
    DEBUG                    = "*"
    NODE_ENV                 = "production"
    MONITORING_ENABLE        = "false"
    PUBLISH_METADATA         = "false"
    PULSE_USERNAME           = "${module.events_rabbitmq_user.username}"
    PULSE_PASSWORD           = "${module.events_rabbitmq_user.password}"
    PULSE_HOSTNAME           = "${var.rabbitmq_hostname}"
    PULSE_VHOST              = "${var.rabbitmq_vhost}"
    FORCE_SSL                = "false"
    TRUST_PROXY              = "true"
  }
}

module "events_web_service" {
  source         = "modules/deployment"
  project_name   = "taskcluster-events"
  service_name   = "events"
  proc_name      = "web"
  readiness_path = "/api/events/v1/ping"
  secret_name    = "${module.events_secrets.secret_name}"
  secrets_hash   = "${module.events_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.events_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_events}"
}
