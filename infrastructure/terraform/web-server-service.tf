module "web_server_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-web-server"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

