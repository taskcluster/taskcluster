module "web_ui_secrets" {
  source       = "modules/service-secrets"
  project_name = "taskcluster-ui"

  secrets = {
    APPLICATION_NAME              = "Taskcluster"
    PORT                          = ""
    GRAPHQL_ENDPOINT              = "${var.root_url}/graphql"
    GRAPHQL_SUBSCRIPTION_ENDPOINT = "${var.root_url}/subscription"
    LOGIN_STRATEGIES              = "github mozilla-auth0"
  }
}

module "web_ui" {
  source         = "modules/deployment"
  project_name   = "taskcluster-ui"
  service_name   = "ui"
  proc_name      = "web"
  root_url       = "${var.root_url}"
  docker_image   = "${local.taskcluster_image_monoimage}"
  secret_name    = "${module.web_ui_secrets.secret_name}"
  secrets_hash   = "${module.web_ui_secrets.secrets_hash}"
  secret_keys    = "${module.web_ui_secrets.env_var_keys}"
  readiness_path = "/"
  cpu            = "100m"
  memory         = "400Mi"
}
