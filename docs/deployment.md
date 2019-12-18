# Deployment

The following describes the recommended installation of `start-worker`.
See [community-tc-config/imagesets](https://github.com/mozilla/community-tc-config/tree/master/imagesets) for examples of how this can be automated.

Any arrangement that suits the needs of the deployment is fine, of course.
For example, you may wish to do something more advanced with the worker logs.

## Linux

* Install the relevant worker implementation
* Install `start-worker` into `/usr/local/bin`.
* Create a runner configuration file at `/etc/start-worker.yml`.
* Create a systemd service to run the worker:

```
# /lib/systemd/system/worker.service
[Unit]
Description=Start TC worker

[Service]
Type=simple
ExecStart=/usr/local/bin/start-worker /etc/start-worker.yml
# log to console to make output visible in cloud consoles, and syslog for ease of
# redirecting to external logging services
StandardOutput=syslog+console
StandardError=syslog+console
User=root

[Install]
RequiredBy=graphical.target
```

* Enable the service with `systemctl enable worker`
