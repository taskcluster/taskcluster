level: major
---
Services that previously used hard-coded values despite advertising Helm parameters now honor those optional Helm parameters:
* `notify.irc_port`
* `github.provisioner_id`
* `github.worker_type`

The last two parameters name a worker pool (`<provisioner_id>/<worker_type>`) that is used as a default for older (v0) `.taskcluster.yml` files.
Rather than set these parameters, users should be encouraged to set the values explicitly in `.taskcluster.yml`.

The notify service no longer accepts Helm configuration property `notify.irc_pulse_queue_name`.  No known deployment has this value set.
