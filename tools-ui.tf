module "tools_secrets" {
  source       = "modules/service-secrets"
  project_name = "taskcluster-tools"

  secrets = {
    APPLICATION_NAME = "bstack-cluster"
    SIGN_IN_METHODS  = "manual"
  }
}

module "tools_ui" {
  source       = "modules/static-service"
  project_name = "taskcluster-tools"
  service_name = "tools"
  secret_name  = "taskcluster-tools"
  root_url     = "${var.root_url}"
  secret_keys  = "${module.tools_secrets.env_var_keys}"
  docker_image = "${local.taskcluster_image_tools}"
}
