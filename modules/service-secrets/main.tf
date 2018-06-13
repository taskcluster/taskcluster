locals {
  context = {
    secrets      = "${var.secrets}"
    project_name = "${var.project_name}"
  }
}

data "jsone_template" "secrets_resource" {
  template     = "${file("${path.module}/secrets_resource.yaml")}"
  yaml_context = "${jsonencode(local.context)}"
}

data "template_file" "secrets_resource_encoded" {
  template = "${data.jsone_template.secrets_resource.rendered}"
  vars     = "${var.secrets}"
}

resource "k8s_manifest" "taskcluster-secrets" {
  content = "${data.template_file.secrets_resource_encoded.rendered}"
}

data "jsone_templates" "service_account" {
  template     = "${file("${path.module}/service-account.yaml")}"
  yaml_context = "${jsonencode(local.context)}"
}

resource "k8s_manifest" "service_account" {
  count   = "${length(data.jsone_templates.service_account.rendered)}"
  content = "${data.jsone_templates.service_account.rendered[count.index]}"
}
