module "web_server_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-web-server"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

resource "random_string" "web_server_access_token" {
  length           = 65
  override_special = "_-"
}

module "web_server_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-web-server"
  disabled_services = "${var.disabled_services}"

  secrets = {
    TASKCLUSTER_CLIENT_ID       = "static/taskcluster/web-server"
    TASKCLUSTER_ACCESS_TOKEN    = "${random_string.web_server_access_token.result}"
    NODE_ENV                    = "production"
    MONITORING_ENABLE           = "true"
    MONITORING_PROJECT          = "taskcluster-web-server"
    MOZILLA_AUTH0_DOMAIN        = "${var.web_server_mozilla_auth0_domain}"
    MOZILLA_AUTH0_CLIENT_ID     = "${var.web_server_mozilla_auth0_client_id}"
    MOZILLA_AUTH0_CLIENT_SECRET = "${var.web_server_mozilla_auth0_client_secret}"
    MOZILLA_AUTH0_AUDIENCE      = "${var.web_server_mozilla_auth0_audience}"
    MOZILLA_AUTH0_SCOPE         = "${var.web_server_mozilla_auth0_scope}"
    GITHUB_CLIENT_ID            = "${var.web_server_github_client_id}"
    GITHUB_CLIENT_SECRET        = "${var.web_server_github_client_secret}"
    PULSE_USERNAME              = "${module.web_server_rabbitmq_user.username}"
    PULSE_PASSWORD              = "${module.web_server_rabbitmq_user.password}"
    PULSE_HOSTNAME              = "${var.rabbitmq_hostname}"
    PULSE_VHOST                 = "${var.rabbitmq_vhost}"
    PUBLIC_URL                  = "${var.root_url}"
  }
}

module "web_server_service" {
  source         = "modules/deployment"
  project_name   = "taskcluster-web-server"
  service_name   = "web-server"
  proc_name      = "web"
  readiness_path = "/.well-known/apollo/server-health"
  secret_name    = "${module.web_server_secrets.secret_name}"
  secrets_hash   = "${module.web_server_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.web_server_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_monoimage}"
}
