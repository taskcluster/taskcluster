module "web_ui_secrets" {
  source       = "modules/service-secrets"
  project_name = "taskcluster-ui"

  secrets = {
    APPLICATION_NAME              = "Taskcluster"
    PORT                          = ""
    GRAPHQL_ENDPOINT              = "https://taskcluster-web-server.herokuapp.com/graphql"
    GRAPHQL_SUBSCRIPTION_ENDPOINT = "wss://taskcluster-web-server.herokuapp.com/subscription"
    LOGIN_STRATEGIES              = ""
  }
}

module "web_ui" {
  source         = "modules/deployment"
  project_name   = "taskcluster-ui"
  service_name   = "ui"
  root_url       = "${var.root_url}"
  docker_image   = "${local.taskcluster_image_ui}"
  secret_name    = "${module.web_ui_secrets.secret_name}"
  secrets_hash   = "${module.web_ui_secrets.secrets_hash}"
  secret_keys    = "${module.web_ui_secrets.env_var_keys}"
  readiness_path = "/"
  cpu            = "100m"
  memory         = "400Mi"
}
