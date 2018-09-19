module "github_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  project_name   = "taskcluster-github"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

resource "random_string" "github_access_token" {
  length           = 65
  override_special = "_-"
}

module "github_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-github"
  disabled_services = "${var.disabled_services}"

  secrets = {
    TASKCLUSTER_CLIENT_ID    = "static/taskcluster/github"
    TASKCLUSTER_ACCESS_TOKEN = "${random_string.github_access_token.result}"
    DEBUG                    = "*"
    NODE_ENV                 = "production"
    MONITORING_ENABLE        = "false"
    PUBLISH_METADATA         = "false"
    AZURE_ACCOUNT_NAME       = "${azurerm_storage_account.base.name}"
    PULSE_USERNAME           = "taskcluster-github"
    PULSE_PASSWORD           = "${module.github_rabbitmq_user.password}"
    PULSE_HOSTNAME           = "${var.rabbitmq_hostname}"
    PULSE_VHOST              = "${var.rabbitmq_vhost}"
    FORCE_SSL                = "false"
    TRUST_PROXY              = "true"
    GITHUB_INTEGRATION_ID    = "${var.github_integration_id}"
    GITHUB_OAUTH_TOKEN       = "${var.github_oauth_token}"
    GITHUB_PRIVATE_PEM       = "${var.github_private_pem}"
    WEBHOOK_SECRET           = "${var.github_webhook_secret}"
  }
}

module "github_web_service" {
  source         = "modules/deployment"
  project_name   = "taskcluster-github"
  service_name   = "github"
  proc_name      = "web"
  readiness_path = "/api/github/v1/ping"
  secret_name    = "${module.github_secrets.secret_name}"
  secrets_hash   = "${module.github_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.github_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_github}"
}

module "github_handler" {
  source         = "modules/deployment"
  project_name   = "taskcluster-github"
  service_name   = "github"
  proc_name      = "worker"
  background_job = true
  secret_name    = "${module.github_secrets.secret_name}"
  secrets_hash   = "${module.github_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.github_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_github}"
}

module "github_sync_installations" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-github"
  job_name         = "sync"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.github_secrets.secret_name}"
  secrets_hash     = "${module.github_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.github_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_github}"
}
