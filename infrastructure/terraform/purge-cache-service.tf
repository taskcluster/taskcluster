resource "random_string" "purge_cache_access_token" {
  length           = 65
  override_special = "_-"
}

module "purge_cache_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-purge-cache"
  disabled_services = "${var.disabled_services}"

  secrets = {
    TASKCLUSTER_CLIENT_ID    = "static/taskcluster/purge-cache"
    TASKCLUSTER_ACCESS_TOKEN = "${random_string.purge_cache_access_token.result}"
    FORCE_SSL                = "false"
    TRUST_PROXY              = "true"
    NODE_ENV                 = "production"
    MONITORING_ENABLE        = "true"
    AZURE_ACCOUNT            = "${azurerm_storage_account.base.name}"
  }
}

module "purge_cache_web_service" {
  source         = "modules/deployment"
  project_name   = "taskcluster-purge-cache"
  service_name   = "purge-cache"
  proc_name      = "web"
  readiness_path = "/api/purge-cache/v1/ping"
  secret_name    = "${module.purge_cache_secrets.secret_name}"
  secrets_hash   = "${module.purge_cache_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.purge_cache_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_monoimage}"
}

module "purge_cache_expire_artifacts" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-purge-cache"
  service_name     = "purge-cache"
  job_name         = "expireCachePurges"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.purge_cache_secrets.secret_name}"
  secrets_hash     = "${module.purge_cache_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.purge_cache_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_monoimage}"
}
