locals {
  re_name = "${replace(var.project_name, "-", "\\-")}"
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
