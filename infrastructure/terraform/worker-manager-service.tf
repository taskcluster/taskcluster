resource "random_string" "worker_manager_access_token" {
  length           = 65
  override_special = "_-"
}

module "worker_manager_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-worker-manager"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

module "worker_manager_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-worker-manager"
  disabled_services = "${var.disabled_services}"

  secrets = {
    TASKCLUSTER_CLIENT_ID    = "static/taskcluster/worker-manager"
    TASKCLUSTER_ACCESS_TOKEN = "${random_string.worker_manager_access_token.result}"
    NODE_ENV                 = "production"
    PULSE_USERNAME           = "${module.worker_manager_rabbitmq_user.username}"
    PULSE_PASSWORD           = "${module.worker_manager_rabbitmq_user.password}"
    PULSE_HOSTNAME           = "${var.rabbitmq_hostname}"
    PULSE_VHOST              = "${var.rabbitmq_vhost}"
    AZURE_ACCOUNT            = "${azurerm_storage_account.base.name}"
    FORCE_SSL                = "false"
    TRUST_PROXY              = "true"
    PROVIDERS                = "${var.worker_manager_providers}"
  }
}

module "worker_manager_web_service" {
  source         = "modules/deployment"
  project_name   = "taskcluster-worker-manager"
  service_name   = "worker-manager"
  proc_name      = "web"
  readiness_path = "/api/worker-manager/v1/ping"
  secret_name    = "${module.worker_manager_secrets.secret_name}"
  secrets_hash   = "${module.worker_manager_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.worker_manager_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_monoimage}"
}

module "worker_manager_provisioner" {
  source            = "modules/deployment"
  project_name      = "taskcluster-worker-manager"
  service_name      = "worker-manager"
  proc_name         = "provisioner"
  background_job    = true
  disabled_services = "${var.disabled_services}"
  secret_name       = "${module.worker_manager_secrets.secret_name}"
  secrets_hash      = "${module.worker_manager_secrets.secrets_hash}"
  root_url          = "${var.root_url}"
  secret_keys       = "${module.worker_manager_secrets.env_var_keys}"
  docker_image      = "${local.taskcluster_image_monoimage}"
}

module "worker_manager_worker_scanner" {
  source            = "modules/deployment"
  project_name      = "taskcluster-worker-manager"
  service_name      = "worker-manager"
  proc_name         = "workerscanner"
  background_job    = true
  disabled_services = "${var.disabled_services}"
  secret_name       = "${module.worker_manager_secrets.secret_name}"
  secrets_hash      = "${module.worker_manager_secrets.secrets_hash}"
  root_url          = "${var.root_url}"
  secret_keys       = "${module.worker_manager_secrets.env_var_keys}"
  docker_image      = "${local.taskcluster_image_monoimage}"
}
