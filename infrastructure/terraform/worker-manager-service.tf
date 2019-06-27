module "worker_manager_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-worker-manager"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}