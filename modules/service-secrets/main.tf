locals {
  context = {
    secrets      = "${var.secrets}"
    project_name = "${var.project_name}"
  }

  is_enabled = "${contains(var.disabled_services, var.project_name) ? 0 : 1}"
}

data "jsone_templates" "service_account" {
  template     = "${file("${path.module}/service-account.yaml")}"
  yaml_context = "${jsonencode(local.context)}"
}

resource "k8s_manifest" "service_account" {
  count   = "${local.is_enabled * length(data.jsone_templates.service_account.rendered)}"
  content = "${data.jsone_templates.service_account.rendered[count.index]}"
}

data "jsone_template" "secrets_resource" {
  template     = "${file("${path.module}/secrets_resource.yaml")}"
  yaml_context = "${jsonencode(local.context)}"
}

resource "k8s_manifest" "secrets_resource" {
  depends_on = ["k8s_manifest.service_account"]
  count   = "${local.is_enabled}"
  content = "${data.jsone_template.secrets_resource.rendered}"
}
