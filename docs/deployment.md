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

## Windows

* Install the relevant worker implementation
* Install the relevant worker-runner binary as `c:\worker-runner\start-worker.exe`
* Install [NSSM](http://nssm.cc/)
* Create a runner configuration at `c:\worker-runner\runner.yml`
* Run these commands to create and configure the service:

```shell
nssm install worker-runner c:\worker-runner\start-worker.exe
nssm set worker-runner AppDirectory c:\worker-runner
nssm set worker-runner AppParameters c:\worker-runner\runner.yml
nssm set worker-runner DisplayName "Worker Runner"
nssm set worker-runner Description "Interface between workers and Taskcluster services"
nssm set worker-runner Start SERVICE_AUTO_START
nssm set worker-runner Type SERVICE_WIN32_OWN_PROCESS
nssm set worker-runner AppPriority NORMAL_PRIORITY_CLASS
nssm set worker-runner AppNoConsole 1
nssm set worker-runner AppAffinity All
nssm set worker-runner AppStopMethodSkip 0
nssm set worker-runner AppStopMethodConsole 1500
nssm set worker-runner AppStopMethodWindow 1500
nssm set worker-runner AppStopMethodThreads 1500
nssm set worker-runner AppThrottle 1500
nssm set worker-runner AppExit Default Exit
nssm set worker-runner AppRestartDelay 0
nssm set worker-runner AppStdout c:\worker-runner\worker-runner-service.log
nssm set worker-runner AppStderr c:\worker-runner\worker-runner-service.log
nssm set worker-runner AppStdoutCreationDisposition 4
nssm set worker-runner AppStderrCreationDisposition 4
nssm set worker-runner AppRotateFiles 1
nssm set worker-runner AppRotateOnline 1
nssm set worker-runner AppRotateSeconds 3600
nssm set worker-runner AppRotateBytes 0
```

Start the `Worker Runner` service manually (`net start "Worker Runner"`) and consult its log file (`C:\worker-runner\worker-runner-service.log`) and/or the worker implementation's log file(s) for details.
