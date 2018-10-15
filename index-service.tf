module "index_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-index"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

resource "random_string" "index_access_token" {
  length           = 65
  override_special = "_-"
}

module "index_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-index"
  disabled_services = "${var.disabled_services}"

  secrets = {
    TASKCLUSTER_CLIENT_ID    = "static/taskcluster/index"
    TASKCLUSTER_ACCESS_TOKEN = "${random_string.index_access_token.result}"
    DEBUG                    = "*"
    NODE_ENV                 = "production"
    MONITORING_ENABLE        = "false"
    PUBLISH_METADATA         = "false"
    AZURE_ACCOUNT            = "${azurerm_storage_account.base.name}"
    PULSE_USERNAME           = "${module.events_rabbitmq_user.username}"
    PULSE_PASSWORD           = "${module.index_rabbitmq_user.password}"
    PULSE_HOSTNAME           = "${var.rabbitmq_hostname}"
    PULSE_VHOST              = "${var.rabbitmq_vhost}"
    FORCE_SSL                = "false"
    TRUST_PROXY              = "true"
  }
}

module "index_web_service" {
  source         = "modules/deployment"
  project_name   = "taskcluster-index"
  service_name   = "index"
  proc_name      = "web"
  readiness_path = "/api/index/v1/ping"
  secret_name    = "${module.index_secrets.secret_name}"
  secrets_hash   = "${module.index_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.index_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_index}"
}

module "index_handlers" {
  source         = "modules/deployment"
  project_name   = "taskcluster-index"
  service_name   = "index"
  proc_name      = "handlers"
  background_job = true
  secret_name    = "${module.index_secrets.secret_name}"
  secrets_hash   = "${module.index_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.index_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_index}"
}

module "index_expire_job" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-index"
  job_name         = "expire"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.index_secrets.secret_name}"
  secrets_hash     = "${module.index_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.index_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_index}"
}
