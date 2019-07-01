module "hooks_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-hooks"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

