module "tools_secrets" {
  source       = "modules/service-secrets"
  project_name = "taskcluster-tools"

  secrets = {
    APPLICATION_NAME = "${var.cluster_name}"
    SIGN_IN_METHODS  = "manual"
  }
}

module "tools_ui" {
  source       = "modules/static-service"
  project_name = "taskcluster-tools"
  service_name = "tools"
  secret_name  = "${module.tools_secrets.secret_name}"
  root_url     = "${var.root_url}"
  secret_keys  = "${module.tools_secrets.env_var_keys}"
  docker_image = "${local.taskcluster_image_tools}"
}
