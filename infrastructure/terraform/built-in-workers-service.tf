resource "random_string" "built_in_workers_access_token" {
  length           = 65
  override_special = "_-"
}

module "built_in_workers_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-built-in-workers"
  disabled_services = "${var.disabled_services}"

  secrets = {
    TASKCLUSTER_CLIENT_ID    = "static/taskcluster/built-in-workers"
    TASKCLUSTER_ACCESS_TOKEN = "${random_string.built_in_workers_access_token.result}"
    NODE_ENV                 = "production"
    MONITORING_ENABLE        = "false"
    PUBLISH_METADATA         = "false"
  }
}

module "built_in_workers_listeners" {
  source         = "modules/deployment"
  project_name   = "taskcluster-built-in-workers"
  service_name   = "built-in-workers"
  proc_name      = "server"
  background_job = true
  secret_name    = "${module.built_in_workers_secrets.secret_name}"
  secrets_hash   = "${module.built_in_workers_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.built_in_workers_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_monoimage}"
}
