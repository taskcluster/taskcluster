module "github_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-github"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

