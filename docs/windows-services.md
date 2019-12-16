# Generic-Worker Service

Taskcluster-Worker-Runner supports starting generic-worker as a Windows service.
It is up to you to define such a service, but it must meet a few requirements:

 * Automatically reads from the configuration file written by `start-worker`
   (the file named in `worker.configPath` in the runner configuration)

Note that the service created by the built-in `generic-worker install service`
does not meet these requirements, as it is intended for use without
Taskcluster-Worker-Runner.

## Recommended Setup

The following steps will set up a generic-worker service that meets the above requirements.
They use [NSSM](http://nssm.cc/) to install the service.

* Install generic-worker as `c:\generic-worker\generic-worker.exe`
* Install NSSM
* Run these commands to create and configure the service:

```shell
nssm install generic-worker c:\generic-worker\generic-worker.exe
nssm set generic-worker AppDirectory c:\generic-worker
nssm set generic-worker AppParameters run --config c:\generic-worker\generic-worker-config.yml
nssm set generic-worker DisplayName "Generic Worker"
nssm set generic-worker Description "A taskcluster worker that runs on all mainstream platforms"
nssm set generic-worker Start SERVICE_DEMAND_START
nssm set generic-worker Type SERVICE_WIN32_OWN_PROCESS
nssm set generic-worker AppPriority NORMAL_PRIORITY_CLASS
nssm set generic-worker AppNoConsole 1
nssm set generic-worker AppAffinity All
nssm set generic-worker AppStopMethodSkip 0
nssm set generic-worker AppStopMethodConsole 1500
nssm set generic-worker AppStopMethodWindow 1500
nssm set generic-worker AppStopMethodThreads 1500
nssm set generic-worker AppThrottle 1500
nssm set generic-worker AppExit Default Exit
nssm set generic-worker AppRestartDelay 0
nssm set generic-worker AppStdout c:\generic-worker\generic-worker-service.log
nssm set generic-worker AppStderr c:\generic-worker\generic-worker-service.log
nssm set generic-worker AppStdoutCreationDisposition 4
nssm set generic-worker AppStderrCreationDisposition 4
nssm set generic-worker AppRotateFiles 1
nssm set generic-worker AppRotateOnline 1
nssm set generic-worker AppRotateSeconds 3600
nssm set generic-worker AppRotateBytes 0
```

* Add the following to your runner configuration:

```yaml
worker:
  implementation: generic-worker
  service: generic-worker
  configPath: c:\generic-worker\generic-worker-config.yml
```
