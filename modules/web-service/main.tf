locals {
  context = {
    docker_image = "${var.docker_image}"
    project_name = "${var.project_name}"
    service_name = "${var.service_name}"
    secret_keys  = "${var.secret_keys}"
    secret_name  = "${var.secret_name}"
    root_url     = "${var.root_url}"
    secrets_hash = "${var.secrets_hash}"
  }

  is_enabled = "${contains(var.disabled_services, var.project_name) ? 0 : 1}"
}

data "jsone_template" "deployment" {
  template     = "${file("${path.module}/deployment.yaml")}"
  yaml_context = "${jsonencode(local.context)}"
}

resource "k8s_manifest" "deployment" {
  count   = "${local.is_enabled}"
  content = "${data.jsone_template.deployment.rendered}"
}

data "jsone_template" "service" {
  template     = "${file("${path.module}/service.yaml")}"
  yaml_context = "${jsonencode(local.context)}"
}

resource "k8s_manifest" "service" {
  count   = "${local.is_enabled}"
  content = "${data.jsone_template.service.rendered}"
}
