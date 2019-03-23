resource "random_string" "secrets_azure_signing_key" {
  length = 40
}

resource "random_string" "secrets_azure_crypto_key" {
  length = 32
}

module "secrets_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-secrets"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

resource "random_string" "secrets_access_token" {
  length           = 65
  override_special = "_-"
}
