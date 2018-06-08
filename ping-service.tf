module "ping_secrets" {
  source       = "modules/service-secrets"
  project_name = "taskcluster-ping"

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
  source       = "modules/web-service"
  project_name = "taskcluster-ping"
  service_name = "ping"
  secret_name  = "taskcluster-ping"
  root_url     = "${var.root_url}"
  secret_keys  = "${module.ping_secrets.env_var_keys}"
  docker_image = "${local.taskcluster_image_ping}"
}
