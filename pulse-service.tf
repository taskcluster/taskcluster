module "pulse_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-pulse"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

resource "random_string" "pulse_access_token" {
  length           = 65
  override_special = "_-"
}

module "pulse_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-pulse"
  disabled_services = "${var.disabled_services}"

  secrets = {
    TASKCLUSTER_CLIENT_ID    = "static/taskcluster/pulse"
    TASKCLUSTER_ACCESS_TOKEN = "${random_string.pulse_access_token.result}"
    AZURE_ACCOUNT            = "${azurerm_storage_account.base.name}"
    DEBUG                    = "*"
    NODE_ENV                 = "production"
    MONITORING_ENABLE        = "false"
    PUBLISH_METADATA         = "false"
    MOCK_MAINTENANCE         = "true"                                       # temporary!

    NAMESPACE_PREFIX = ""               # not sharing with anything else, so no need
    USERNAME_PREFIX  = "${var.prefix}-" # play nicely with other deployments

    RABBIT_BASE_URL = "https://${var.rabbitmq_hostname}/api/"
    RABBIT_USERNAME = "${var.rabbitmq_admin_username}"
    RABBIT_PASSWORD = "${var.rabbitmq_password}"

    TASKCLUSTER_AMQP_HOSTNAME = "${var.rabbitmq_hostname}"
    TASKCLUSTER_AMQP_PORT     = "5671"
    TASKCLUSTER_AMQP_PROTOCOL = "amqps"
    TASKCLUSTER_AMQP_VHOST    = "${var.rabbitmq_vhost}"
  }
}

module "pulse_web_service" {
  source         = "modules/deployment"
  project_name   = "taskcluster-pulse"
  service_name   = "pulse"
  proc_name      = "web"
  readiness_path = "/api/pulse/v1/ping"
  secret_name    = "${module.pulse_secrets.secret_name}"
  secrets_hash   = "${module.pulse_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.pulse_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_pulse}"
}

module "pulse_monitor" {
  source         = "modules/deployment"
  project_name   = "taskcluster-pulse"
  service_name   = "pulse"
  proc_name      = "monitorRabbit"
  background_job = true
  secret_name    = "${module.pulse_secrets.secret_name}"
  secrets_hash   = "${module.pulse_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.pulse_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_pulse}"
}

module "pulse_expire_namespaces" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-pulse"
  job_name         = "expireNamespaces"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.pulse_secrets.secret_name}"
  secrets_hash     = "${module.pulse_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.pulse_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_pulse}"
}

module "pulse_rotate_namespaces" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-pulse"
  job_name         = "expireNamespaces"
  schedule         = "0,10,20,30,40,50 * * * *"
  deadline_seconds = 600
  secret_name      = "${module.pulse_secrets.secret_name}"
  secrets_hash     = "${module.pulse_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.pulse_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_pulse}"
}
