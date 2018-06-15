module "ping_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-ping"
  disabled_services = "${var.disabled_services}"

  secrets = {
    DEBUG             = "*"
    PUBLIC_URL        = "https://taskcluster.example.com/ping/"
    NODE_ENV          = "production"
    FORCE_SSL         = "false"
    TRUST_PROXY       = "false"
    MONITORING_ENABLE = "false"
  }
}

module "ping_web_service" {
  source            = "modules/web-service"
  project_name      = "taskcluster-ping"
  disabled_services = "${var.disabled_services}"
  service_name      = "ping"
  secret_name       = "${module.ping_secrets.secret_name}"
  secrets_hash      = "${module.ping_secrets.secrets_hash}"
  root_url          = "${var.root_url}"
  secret_keys       = "${module.ping_secrets.env_var_keys}"
  docker_image      = "${local.taskcluster_image_ping}"
}
