locals {
  context = {
    docker_image     = "${var.docker_image}"
    schedule         = "${var.schedule}"
    deadline_seconds = "${var.deadline_seconds}"
    project_name     = "${var.project_name}"
    service_name     = "${var.service_name}"
    proc_name        = "${var.proc_name}"
    secret_keys      = "${var.secret_keys}"
    secrets_hash     = "${var.secrets_hash}"
    secret_name      = "${var.secret_name}"
    root_url         = "${var.root_url}"
    volume_mounts    = "${var.volume_mounts}"
    is_monoimage     = "${var.is_monoimage}"
  }

  is_enabled = "${contains(var.disabled_services, var.project_name) ? 0 : 1}"
}

data "jsone_template" "cron_job" {
  template     = "${file("${path.module}/cron.yaml")}"
  yaml_context = "${jsonencode(local.context)}"
}

resource "k8s_manifest" "cron_job" {
  count   = "${local.is_enabled}"
  content = "${data.jsone_template.cron_job.rendered}"
}
