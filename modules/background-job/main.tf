locals {
  context = {
    docker_image = "${var.docker_image}"
    schedule     = "${var.schedule}"
    project_name = "${var.project_name}"
    job_name     = "${var.job_name}"
    secret_keys  = "${var.secret_keys}"
    secret_name  = "${var.secret_name}"
    root_url     = "${var.root_url}"
  }
}

data "jsone_template" "cron_job" {
  template     = "${file("${path.module}/cron.yaml")}"
  yaml_context = "${jsonencode(local.context)}"
}

resource "k8s_manifest" "cron_job" {
  content = "${data.jsone_template.cron_job.rendered}"
}
