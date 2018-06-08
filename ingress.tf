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

data "template_file" "taskcluster_ingress" {
  template = "${file("${path.module}/ingress.yaml")}"
}

resource "k8s_manifest" "taskcluster_ingress" {
  content    = "${data.template_file.taskcluster_ingress.rendered}"
  depends_on = ["data.template_file.tls_secret"]
}

# TODO: https://github.com/kubernetes/ingress-gce#backend-https

