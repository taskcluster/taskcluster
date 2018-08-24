resource "random_string" "secrets_azure_signing_key" {
  length = 40
}

resource "random_string" "secrets_azure_crypto_key" {
  length = 32
}

module "secrets_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  project_name   = "taskcluster-secrets"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

resource "random_string" "secrets_access_token" {
  length           = 65
  override_special = "_-"
}

module "secrets_secrets" {
  source       = "modules/service-secrets"
  project_name = "taskcluster-secrets"

  secrets = {
    TASKCLUSTER_CLIENT_ID    = "static/taskcluster/secrets"
    TASKCLUSTER_ACCESS_TOKEN = "${random_string.secrets_access_token.result}"
    DEBUG                    = "*"
    NODE_ENV                 = "production"
    MONITORING_ENABLE        = "false"
    PUBLISH_METADATA         = "false"
    AZURE_ACCOUNT            = "${azurerm_storage_account.base.name}"
    AZURE_TABLE_NAME         = "Secrets"
    AZURE_CRYPTO_KEY         = "${base64encode(random_string.secrets_azure_crypto_key.result)}"
    AZURE_SIGNING_KEY        = "${random_string.secrets_azure_signing_key.result}"
    PULSE_USERNAME           = "taskcluster-secrets"
    PULSE_PASSWORD           = "${module.secrets_rabbitmq_user.password}"
  }
}

module "secrets_web_service" {
  source         = "modules/deployment"
  project_name   = "taskcluster-secrets"
  service_name   = "secrets"
  proc_name      = "web"
  readiness_path = "/api/secrets/v1/ping"
  secret_name    = "${module.secrets_secrets.secret_name}"
  secrets_hash   = "${module.secrets_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.secrets_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_secrets}"
}

module "secrets_expire_job" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-secrets"
  job_name         = "expire"
  schedule         = "0 * * * *"
  deadline_seconds = 600
  secret_name      = "${module.secrets_secrets.secret_name}"
  secrets_hash     = "${module.secrets_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.secrets_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_secrets}"
}
