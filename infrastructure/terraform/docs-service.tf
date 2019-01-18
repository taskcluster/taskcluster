module "docs_secrets" {
  source       = "modules/service-secrets"
  project_name = "taskcluster-docs"

  secrets = {
    APPLICATION_NAME = "bstack-cluster"
  }
}

module "docs_ui" {
  source         = "modules/deployment"
  project_name   = "taskcluster-docs"
  service_name   = "docs"
  secret_name    = "taskcluster-docs"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.docs_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_docs}"
  secrets_hash   = "${module.docs_secrets.secrets_hash}"
  readiness_path = "/docs"
}
