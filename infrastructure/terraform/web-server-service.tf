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
