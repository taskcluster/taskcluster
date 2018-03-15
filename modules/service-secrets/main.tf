resource "kubernetes_secret" "taskcluster-secrets" {
  metadata {
    name = "${var.service_name}"
  }

  data = "${var.secrets}"
}
