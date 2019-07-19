module "auth_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-auth"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

module "github_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-github"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

module "hooks_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-hooks"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

module "index_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-index"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

module "notify_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-notify"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

module "queue_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-queue"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

module "secrets_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-secrets"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

module "web_server_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-web-server"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

module "worker_manager_rabbitmq_user" {
  source         = "./modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-worker-manager"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}
