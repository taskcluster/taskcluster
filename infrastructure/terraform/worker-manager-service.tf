resource "random_string" "worker_manager_access_token" {
  length           = 65
  override_special = "_-"
}

module "worker_manager_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-worker-manager"
  disabled_services = "${var.disabled_services}"

  secrets = {
    TASKCLUSTER_CLIENT_ID    = "static/taskcluster/worker-manager"
    TASKCLUSTER_ACCESS_TOKEN = "${random_string.worker_manager_access_token.result}"
    NODE_ENV                 = "production"
    MONITORING_ENABLE        = "true"
    PUBLISH_METADATA         = "false"
    AZURE_ACCOUNT            = "${azurerm_storage_account.base.name}"
    FORCE_SSL                = "false"
    TRUST_PROXY              = "true"
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
