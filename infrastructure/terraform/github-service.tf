module "github_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-github"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

resource "random_string" "github_access_token" {
  length           = 65
  override_special = "_-"
}
