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

* If running in Azure, this service should include `After=walinuxagent.service` in order
  to set up the ovf-env.xml file that is required to access custom data
* Enable the service with `systemctl enable worker`

