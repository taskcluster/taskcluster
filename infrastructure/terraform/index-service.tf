module "index_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-index"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

