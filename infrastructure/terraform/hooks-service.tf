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
