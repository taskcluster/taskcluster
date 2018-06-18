data "template_file" "tls_secret" {
  template = "${file("${path.module}/tls_secret.yaml")}"

  vars {
    tls_crt = "${var.tls_crt}"
    tls_key = "${var.tls_key}"
  }
}

resource "k8s_manifest" "taskcluster-secrets" {
  content = "${data.template_file.tls_secret.rendered}"
}

locals {
  ingress_context = {
    disabled_services = "${var.disabled_services}"
  }
}

data "jsone_template" "taskcluster_ingress" {
  template     = "${file("${path.module}/ingress.yaml")}"
  yaml_context = "${jsonencode(local.ingress_context)}"
}

resource "k8s_manifest" "taskcluster_ingress" {
  content    = "${data.jsone_template.taskcluster_ingress.rendered}"
  depends_on = ["k8s_manifest.taskcluster-secrets"]
}

# TODO: https://github.com/kubernetes/ingress-gce#backend-https


# TODO: Set up service accounts for ingress!
