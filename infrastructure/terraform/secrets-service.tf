module "secrets_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-secrets"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

