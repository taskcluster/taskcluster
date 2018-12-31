module "hooks_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-hooks"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

resource "random_string" "hooks_access_token" {
  length           = 65
  override_special = "_-"
}

resource "random_string" "hooks_table_signing_key" {
  length = 40
}

resource "random_string" "hooks_table_crypto_key" {
  length = 32
}

module "hooks_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-hooks"
  disabled_services = "${var.disabled_services}"

  secrets = {
    TASKCLUSTER_CLIENT_ID    = "static/taskcluster/hooks"
    TASKCLUSTER_ACCESS_TOKEN = "${random_string.hooks_access_token.result}"
    DEBUG                    = "*"
    FORCE_SSL                = "false"
    TRUST_PROXY              = "true"
    NODE_ENV                 = "production"
    MONITORING_ENABLE        = "false"
    PUBLISH_METADATA         = "false"
    AZURE_ACCOUNT            = "${azurerm_storage_account.base.name}"
    PULSE_USERNAME           = "${module.hooks_rabbitmq_user.username}"
    PULSE_PASSWORD           = "${module.hooks_rabbitmq_user.password}"
    PULSE_HOSTNAME           = "${var.rabbitmq_hostname}"
    PULSE_VHOST              = "${var.rabbitmq_vhost}"
    HOOK_TABLE_NAME          = "Hooks"
    TABLE_CRYPTO_KEY         = "${base64encode(random_string.hooks_table_crypto_key.result)}"
    TABLE_SIGNING_KEY        = "${random_string.hooks_table_signing_key.result}"
  }
}

module "hooks_web_service" {
  source         = "modules/deployment"
  project_name   = "taskcluster-hooks"
  service_name   = "hooks"
  proc_name      = "web"
  readiness_path = "/api/hooks/v1/ping"
  secret_name    = "${module.hooks_secrets.secret_name}"
  secrets_hash   = "${module.hooks_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.hooks_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_hooks}"
}

module "hooks_scheduler" {
  source         = "modules/deployment"
  project_name   = "taskcluster-hooks"
  service_name   = "hooks"
  proc_name      = "scheduler"
  background_job = true
  secret_name    = "${module.hooks_secrets.secret_name}"
  secrets_hash   = "${module.hooks_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.hooks_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_hooks}"
}

module "hooks_listeners" {
  source         = "modules/deployment"
  project_name   = "taskcluster-hooks"
  service_name   = "hooks"
  proc_name      = "listeners"
  background_job = true
  secret_name    = "${module.hooks_secrets.secret_name}"
  secrets_hash   = "${module.hooks_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.hooks_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_hooks}"
}
