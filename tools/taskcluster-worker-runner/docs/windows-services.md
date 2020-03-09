# Generic-Worker Service

Taskcluster-Worker-Runner supports starting generic-worker as a Windows service.
It is up to you to define such a service, but it must meet a few requirements:

 * Uses the configuration file written by `start-worker`
   (the file named in `worker.configPath` in the runner configuration)
 * Connects the worker's stdin, stdout, and stderr to the named pipe given in
   `worker.protocolPipe`.  This is used for bi-directional communication with
   the running worker.

Note that the service created by the built-in `generic-worker install service`
does not meet these requirements, as it is intended for use without
Taskcluster-Worker-Runner.

## Recommended Setup

The following steps will set up a generic-worker service that meets the above requirements.
They use [NSSM](http://nssm.cc/) to install and run the service.

* Install generic-worker as `c:\generic-worker\generic-worker.exe`
* Install NSSM
* Run these commands to create and configure the service:
* If running in an Azure vm instance, you must wait on the Azure Virtual Machine Agent to set up the `CustomData.bin` file before starting

```shell
nssm install "Generic Worker" c:\generic-worker\generic-worker.exe
nssm set "Generic Worker" AppDirectory c:\generic-worker
nssm set "Generic Worker" AppParameters run --config c:\generic-worker\generic-worker-config.yml --worker-runner-protocol-pipe \\.\pipe\generic-worker --with-worker-runner
nssm set "Generic Worker" DisplayName "Generic Worker"
nssm set "Generic Worker" Description "A taskcluster worker that runs on all mainstream platforms"
nssm set "Generic Worker" Start SERVICE_DEMAND_START
nssm set "Generic Worker" Type SERVICE_WIN32_OWN_PROCESS
nssm set "Generic Worker" AppPriority NORMAL_PRIORITY_CLASS
nssm set "Generic Worker" AppNoConsole 1
nssm set "Generic Worker" AppAffinity All
nssm set "Generic Worker" AppStopMethodSkip 0
nssm set "Generic Worker" AppStopMethodConsole 1500
nssm set "Generic Worker" AppStopMethodWindow 1500
nssm set "Generic Worker" AppStopMethodThreads 1500
nssm set "Generic Worker" AppThrottle 1500
nssm set "Generic Worker" AppExit Default Exit
nssm set "Generic Worker" AppRestartDelay 0
nssm set "Generic Worker" AppStdout c:\generic-worker\generic-worker-service.log
nssm set "Generic Worker" AppStderr c:\generic-worker\generic-worker-service.log
nssm set "Generic Worker" AppStdoutCreationDisposition 4
nssm set "Generic Worker" AppStderrCreationDisposition 4
nssm set "Generic Worker" AppRotateFiles 1
nssm set "Generic Worker" AppRotateOnline 1
nssm set "Generic Worker" AppRotateSeconds 3600
nssm set "Generic Worker" AppRotateBytes 0
```

* Add the following to your runner configuration:

```yaml
worker:
  implementation: generic-worker
  service: "Generic Worker"
  configPath: c:\generic-worker\generic-worker-config.yml
  protocolPipe: \\.\pipe\generic-worker
```
