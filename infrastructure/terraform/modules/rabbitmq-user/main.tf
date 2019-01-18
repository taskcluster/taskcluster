locals {
  re_name = "${replace(var.project_name, "-", "\\-")}"
}

resource "random_string" "rabbitmq_pass" {
  length           = 30
  override_special = "_-.~"
}

resource "rabbitmq_user" "user" {
  name     = "${var.prefix}-${var.project_name}"
  password = "${random_string.rabbitmq_pass.result}"
}

resource "rabbitmq_permissions" "permissions" {
  user  = "${rabbitmq_user.user.name}"
  vhost = "${var.rabbitmq_vhost}"

  permissions {
    configure = "^(queue/${local.re_name}/.*|exchange/${local.re_name}/.*)"
    write     = "^(queue/${local.re_name}/.*|exchange/${local.re_name}/.*)"
    read      = "^(queue/${local.re_name}/.*|exchange/.*)"
  }
}
