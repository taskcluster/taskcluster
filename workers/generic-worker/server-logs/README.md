## server-logs

I've dumped this utility in here for now, as a useful way of viewing server logs of a generic-worker task.

It is only useful for workers configured in OpenCloudConfig, but based on some OpenCloudConfig naming
conventions, it allows you to specify a taskId (and optionally a runId) and will show you the server logs
for that task.

Really this doesn't belong in the generic-worker repo - but until we've had a sort out of the various
command line tools, I'm placing it in here for now.

Note, it requires that you have created a ~/.papertrail.yml file with an appropriate access token, and
that you have installed the [papertrail-cli](https://github.com/papertrail/papertrail-cli).

### Installing

```
go get github.com/taskcluster/generic-worker/worker_types/server-logs
```

### Running

```
$ server-logs TASK_ID [RUN_ID]
```

### Example

```
$ server-logs AByVjWqKT26vrLgc7GobNA
Executing: papertrail --force-color --system 'i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com' --min-time '2019-04-29T11:17:14.325Z' --max-time '2019-04-29T11:23:57.248Z'
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Disk available: 128728612864 bytes 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Task found 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call WTSGetActiveConsoleSessionId with args: [] 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 11B5D72C The operation completed successfully. 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call WTSQueryUserToken with args: [1 118ABB0C] 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 1354088 The operation completed successfully. 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call GetUserProfileDirectoryW with args: [418 0 118ABB30] 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 0 6B The data area passed to a system call is too small. 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call GetUserProfileDirectoryW with args: [418 119A35C0 118ABB30] 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 6D The operation completed successfully. 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: SID S-1-1-0 NOT found in map[string]bool{} - granting access... 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call CreateEnvironmentBlock with args: [118ABB74 418 0] 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 6D6F6372 The system could not find the environment option that was entered. 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call DestroyEnvironmentBlock with args: [349980] 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 2C39AC The operation completed successfully. 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: About to run command: exec.Cmd{Path:".\\generic-worker.exe", Args:[]string{".\\generic-worker.exe", "grant-winsta-access", "--sid", "S-1-1-0"}, Env:[]string{"ALLUSERSPROFILE=C:\\ProgramData", "APPDATA=Z:\\task_1556536397\\AppData\\Roaming", "CommonProgramFiles=C:\\Program Files\\Common Files", "COMPUTERNAME=I-0687324357B79", "ComSpec=C:\\windows\\system32\\cmd.exe", "DCLOCATION=SCL3", "DNSSUFFIX=use1.mozilla.com", "FP_NO_HOST_CHECK=NO", "HOMEDRIVE=C:", "HOMEPATH=\\Users\\task_1556536397", "KTS_HOME=C:\\Program Files\\KTS", "KTS_VERSION=1.19c", "LOCALAPPDATA=Z:\\task_1556536397\\AppData\\Local", "LOGONSERVER=\\\\I-0687324357B79", "MOZILLABUILD=C:\\mozilla-build", "NUMBER_OF_PROCESSORS=8", "OS=Windows_NT", "Path=C:\\windows\\system32;C:\\windows;C:\\windows\\System32\\Wbem;C:\\windows\\System32\\WindowsPowerShell\\v1.0\\;C:\\mozilla-build\\python27;C:\\mozilla-build\\python27\\Scripts;C:\\mozilla-build\\vim\\vim72;C:\\CoreUtils\\bin;C:\\mozilla-build\\buildbotve\\scripts;c:\\Program Files\\Microsoft Windows Performance Toolkit\\;C:\\Users\\cltbld\\AppData\\Local\\Programs\\Common\\Microsoft\\Visual C++ for Python\\9.0;C:\\ProgramData\\chocolatey\\bin;C:\\mozilla-build\\hg;C:\\Program Files\\GNU\\GnuPG\\pub;C:\\Program Files\\Mercurial\\;C:\\Program Files\\Mercurial;C:\\mozilla-build\\7zip;C:\\mozilla-build\\info-zip;C:\\mozilla-build\\kdiff3;C:\\mozilla-build\\moztools-x64\\bin;C:\\mozilla-build\\mozmake;C:\\mozilla-build\\msys\\bin;C:\\mozilla-build\\msys\\local\\bin;C:\\mozilla-build\\nsis-3.0b3;C:\\mozilla-build\\nsis-2.46u;C:\\mozilla-build\\python;C:\\mozilla-build\\python\\Scripts;C:\\mozilla-build\\python3;C:\\mozilla-build\\upx391w;C:\\mozilla-build\\wget;C:\\mozilla-build\\yasm;C:\\Program Files\\Microsoft Windows Performance Toolkit", "PATHEXT=.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC", "PIP_DOWNLOAD_CACHE=y:\\pip-cache", "PROCESSOR_ARCHITECTURE=x86", "PROCESSOR_IDENTIFIER=x86 Family 6 Model 63 Stepping 2, GenuineIntel", "PROCESSOR_LEVEL=6", "PROCESSOR_REVISION=3f02", "ProgramData=C:\\ProgramData", "ProgramFiles=C:\\Program Files", "PSModulePath=C:\\windows\\system32\\WindowsPowerShell\\v1.0\\Modules\\;C:\\Program Files\\AWS Tools\\PowerShell\\", "PUBLIC=C:\\Users\\Public", "SystemDrive=C:", "SystemRoot=C:\\windows", "TASKCLUSTER_INSTANCE_TYPE=c4.2xlarge", "TEMP=C:\\Users\\task_1556536397\\AppData\\Local\\Temp", "TMP=C:\\Users\\task_1556536397\\AppData\\Local\\Temp", "TOOLTOOL_CACHE=y:\\tooltool-cache", "USERDOMAIN=I-0687324357B79", "USERNAME=task_1556536397", "USERPROFILE=C:\\Users\\task_1556536397", "windir=C:\\windows", "windows_tracing_flags=3", "windows_tracing_logfile=C:\\BVTBin\\Tests\\installpackage\\csilogfile.log"}, Dir:"C:\\generic-worker", Stdin:io.Reader(nil), Stdout:(*os.File)(0x11714140), Stderr:(*os.File)(0x11714140), ExtraFiles:[]*os.File(nil), SysProcAttr:(*syscall.SysProcAttr)(0x119ac940), Process:(*os.Process)(nil), ProcessState:(*os.ProcessState)(nil), ctx:context.Context(nil), lookPathErr:error(nil), finished:false, childFiles:[]*os.File(nil), closeAfterStart:[]io.Closer(nil), closeAfterWait:[]io.Closer(nil), goroutine:[]func() error(nil), errch:(chan error)(nil), waitDone:(chan struct {})(nil)} 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Reclaiming task AByVjWqKT26vrLgc7GobNA at 2019-04-29 11:34:14.219 +0000 UTC 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Current task claim expires at 2019-04-29 11:37:14.219 +0000 UTC 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Reclaiming task AByVjWqKT26vrLgc7GobNA in 17m1.2177894s 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call GetProfilesDirectoryW with args: [0 123DE4CC] 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 0 7A The data area passed to a system call is too small. 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call GetProfilesDirectoryW with args: [123F16A0 123DE4CC] 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 123F16A2 The operation completed successfully. 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call GetProcessWindowStation with args: [] 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 28 77A070B4 The operation completed successfully. 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call GetUserObjectInformationW with args: [28 2 12248A00 200 12462A70] 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 77A070B4 The operation completed successfully. 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call GetCurrentThreadId with args: [] 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 13EC 1221FCC4 The operation completed successfully. 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call GetThreadDesktop with args: [13EC] 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 2C 77A070B4 The operation completed successfully. 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call GetUserObjectInformationW with args: [2C 2 12248C00 200 12462AB4] 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 77A070B4 The operation completed successfully. Windows Station:   WinSta0 Desktop:           Default 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call InitializeAcl with args: [123D0480 400 2] 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 2 The operation completed successfully. 
Apr 29 13:17:14 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call AddAccessAllowedAceEx with args: [123D0480 2 B 10000000 12462B00] 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 0 The operation completed successfully. 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call AddAccessAllowedAceEx with args: [123D0480 2 4 2037F 12462B00] 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 0 The operation completed successfully. 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call InitializeSecurityDescriptor with args: [12148600 1] 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 1221FC44 The operation completed successfully. 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call SetSecurityDescriptorDacl with args: [12148600 1 123D0480 0] 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 123D0480 The operation completed successfully. 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call SetUserObjectSecurity with args: [28 12462BD0 12148600] 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 77A070B4 The operation completed successfully. 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call InitializeAcl with args: [123D0900 400 2] 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 2 The operation completed successfully. 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call AddAccessAllowedAce with args: [123D0900 2 201FF 12462B00] 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 0 The operation completed successfully. 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call InitializeSecurityDescriptor with args: [12149900 1] 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 1221FC44 The operation completed successfully. 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call SetSecurityDescriptorDacl with args: [12149900 1 123D0900 0] 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 123D0900 The operation completed successfully. 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call SetUserObjectSecurity with args: [2C 12462C78 12149900] 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 77A070B4 The operation completed successfully. 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Granted S-1-1-0 full control of interactive windows station and desktop 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: JSON payload: {           "supersederUrl": "https://coalesce.mozilla-releng.net/v1/list/3600/5/mozilla-central.7aee3598c287b1937320",           "maxRunTime": 3600,           "artifacts": [             {               "path": "logs",               "type": "directory",               "name": "public/logs"             },             {               "path": "build/blobber_upload_dir",               "type": "directory",               "name": "public/test_info"             }           ],           "command": [             "c:\\mozilla-build\\python\\python.exe -u mozharness\\scripts\\desktop_unittest.py --cfg mozharness\\configs\\unittests\\win_unittest.py --cppunittest-suite=cppunittest --disable-e10s --download-symbols ondemand --cppunittest-suite=cppunittest --disable-e10s"           ],           "env": {             "GECKO_HEAD_REPOSITORY": "https://hg.mozilla.org/mozilla-central",             "MOZ_AUTOMATION": "1",             "EXTRA_MOZHARNESS_CONFIG": "{\"test_packages_url\": \"https://queue.taskcluster.net/v1/task/TqbaOot1RAepRDLcC0GwgQ/artifacts/public/build/target.test_packages.json\", \"installer_url\": \"https://queue.taskcluster.net/v1/task/TqbaOot1RAepRDLcC0GwgQ/artifacts/public/build/target.zip\"}",             "SCCACHE_DISABLE": "1",             "GECKO_HEAD_REV": "2a26f848ec318a586ebe478651b0e20d72afc337"           },           "mounts": [             {               "directory": ".",               "content": {                 "taskId": "TqbaOot1RAepRDLcC0GwgQ",                 "artifact": "public/build/mozharness.zip"               },               "format": "zip"             }           ]         } 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Running task https://tools.taskcluster.net/task-inspector/#AByVjWqKT26vrLgc7GobNA/0 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Creating wrapper script: Z:\task_1556536397\command_000000_wrapper.bat 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call CreateEnvironmentBlock with args: [11729238 418 0] 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 6D6F6378 The system could not find the environment option that was entered. 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Making system call DestroyEnvironmentBlock with args: [349980] 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker:   Result: 1 2C3918 The operation completed successfully. 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Creating task feature Live Log... 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Creating task feature OS Groups... 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Creating task feature Mounts/Caches... 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Creating task feature Supersede... 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Starting task feature Live Log... 
Apr 29 13:17:15 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Starting task feature OS Groups... 
Apr 29 13:17:16 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Starting task feature Mounts/Caches... 
Apr 29 13:17:18 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Starting task feature Supersede... 
Apr 29 13:17:19 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Executing command 0: ["Z:\\task_1556536397\\command_000000_wrapper.bat"] 
Apr 29 13:18:12 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com Microsoft-Windows-DSC: The local configuration manager was shut down. 
Apr 29 13:19:05 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com HaltOnIdle: drive z: exists 
Apr 29 13:19:05 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com HaltOnIdle: Is-ConditionTrue :: generic-worker is running. 
Apr 29 13:19:05 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com HaltOnIdle: instance appears to be productive. 
Apr 29 13:21:04 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com HaltOnIdle: drive z: exists 
Apr 29 13:21:04 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com HaltOnIdle: Is-ConditionTrue :: generic-worker is running. 
Apr 29 13:21:04 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com HaltOnIdle: instance appears to be productive. 
Apr 29 13:22:13 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com Microsoft-Windows-Security-SPP: Failed to schedule Software Protection service for re-start at 2019-05-14T13:04:11Z. Error Code: 0x80070005. 
Apr 29 13:23:04 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com HaltOnIdle: drive z: exists 
Apr 29 13:23:04 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com HaltOnIdle: Is-ConditionTrue :: generic-worker is running. 
Apr 29 13:23:04 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com HaltOnIdle: instance appears to be productive. 
Apr 29 13:23:56 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Request 
Apr 29 13:23:56 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: PUT /AByVjWqKT26vrLgc7GobNA/0/public/logs/localconfig.json?AWSAccessKeyId=********************&Content-Type=application%2Foctet-stream&Expires=1556539745&Signature=BL6x30bNZ5hsjrh1uERZ2PuQhcw%3D HTTP/1.1  Host: taskcluster-public-artifacts.s3.us-west-2.amazonaws.com  User-Agent: Go-http-client/1.1  Content-Length: 2601  Content-Encoding: gzip  Content-Type: application/octet-stream  Accept-Encoding: gzip   
Apr 29 13:23:56 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: 1 put requests issued to https://taskcluster-public-artifacts.s3.us-west-2.amazonaws.com/AByVjWqKT26vrLgc7GobNA/0/public/logs/localconfig.json?AWSAccessKeyId=********************&Content-Type=application%2Foctet-stream&Expires=1556539745&Signature=BL6x30bNZ5hsjrh1uERZ2PuQhcw%3D 
Apr 29 13:23:56 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Response 
Apr 29 13:23:56 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: HTTP/1.1 200 OK  Content-Length: 0  Date: Mon, 29 Apr 2019 11:23:56 GMT  Etag: "aef85428acefe27c0634c100c6550852"  Server: AmazonS3  X-Amz-Id-2: vwIWsrMQCFxKGPFeVgDrT7MjiXA5EGrPftxkJVxsPRwSc50UesPfN4cQ8Miv0rQR7Y4p1aNNEnA=  X-Amz-Request-Id: 14A0A9C49EF704B0  X-Amz-Version-Id: uFrALSTID.q3qQlaXgD5fX0jmJSSqdXd   
Apr 29 13:23:56 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Request 
Apr 29 13:23:56 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: PUT /AByVjWqKT26vrLgc7GobNA/0/public/test_info/resource-usage.json?AWSAccessKeyId=********************&Content-Type=application%2Foctet-stream&Expires=1556539745&Signature=73s2wL0uu5QAi8h0icAPnp9wN5Y%3D HTTP/1.1  Host: taskcluster-public-artifacts.s3.us-west-2.amazonaws.com  User-Agent: Go-http-client/1.1  Content-Length: 6850  Content-Encoding: gzip  Content-Type: application/octet-stream  Accept-Encoding: gzip   
Apr 29 13:23:56 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: 1 put requests issued to https://taskcluster-public-artifacts.s3.us-west-2.amazonaws.com/AByVjWqKT26vrLgc7GobNA/0/public/test_info/resource-usage.json?AWSAccessKeyId=********************&Content-Type=application%2Foctet-stream&Expires=1556539745&Signature=73s2wL0uu5QAi8h0icAPnp9wN5Y%3D 
Apr 29 13:23:56 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Response 
Apr 29 13:23:56 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: HTTP/1.1 200 OK  Content-Length: 0  Date: Mon, 29 Apr 2019 11:23:56 GMT  Etag: "c9cb4b31bde0d10f630b75a50106a95a"  Server: AmazonS3  X-Amz-Id-2: ZkT05cxd0VnBzzwpxt+XSG0obCvG3vHhZCSZdXLw+YqVqzaWQE6n5lTqBR5nt/D6sreRTOeEXME=  X-Amz-Request-Id: 5B97271C59356BAA  X-Amz-Version-Id: AU5nesoiK9ohdIh1jVhGPzCXs7K2fFTa   
Apr 29 13:23:56 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Request 
Apr 29 13:23:56 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: PUT /AByVjWqKT26vrLgc7GobNA/0/public/test_info/system-info.log?AWSAccessKeyId=********************&Content-Type=text%2Fplain&Expires=1556539745&Signature=n5076XRRf6W27jxqdMpkL0aI%2F6A%3D HTTP/1.1  Host: taskcluster-public-artifacts.s3.us-west-2.amazonaws.com  User-Agent: Go-http-client/1.1  Content-Length: 1193  Content-Encoding: gzip  Content-Type: text/plain  Accept-Encoding: gzip   
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: 1 put requests issued to https://taskcluster-public-artifacts.s3.us-west-2.amazonaws.com/AByVjWqKT26vrLgc7GobNA/0/public/test_info/system-info.log?AWSAccessKeyId=********************&Content-Type=text%2Fplain&Expires=1556539745&Signature=n5076XRRf6W27jxqdMpkL0aI%2F6A%3D 
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Response 
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: HTTP/1.1 200 OK  Content-Length: 0  Date: Mon, 29 Apr 2019 11:23:57 GMT  Etag: "ff6c32bb1787d2b266550dac8e665905"  Server: AmazonS3  X-Amz-Id-2: Fw0vdNWjlV0zPnJkWuNNvhUIW1IQfb0o4r7XqdHLtA5XQO97mnUt7YJ1y0dVKjQ7WEVvSSKaqzI=  X-Amz-Request-Id: 4A515DC1E0427CAF  X-Amz-Version-Id: FjvLMMEUhAHwQWDztwwYBGpokGJEVXLr   
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Stopping task feature Supersede... 
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Stopping task feature Mounts/Caches... 
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Stopping task feature OS Groups... 
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Stopping task feature Live Log... 
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Redirecting public/logs/live.log to public/logs/live_backing.log 
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: WARNING: could not terminate livelog exposure: close tcp [::]:60023: use of closed network connection 
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Request 
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: PUT /AByVjWqKT26vrLgc7GobNA/0/public/logs/live_backing.log?AWSAccessKeyId=********************&Content-Type=text%2Fplain%3B%20charset%3Dutf-8&Expires=1556539746&Signature=o8DjMACGbgq74wwvM1Abu26AKAo%3D HTTP/1.1  Host: taskcluster-public-artifacts.s3.us-west-2.amazonaws.com  User-Agent: Go-http-client/1.1  Content-Length: 24207  Content-Encoding: gzip  Content-Type: text/plain; charset=utf-8  Accept-Encoding: gzip   
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: 1 put requests issued to https://taskcluster-public-artifacts.s3.us-west-2.amazonaws.com/AByVjWqKT26vrLgc7GobNA/0/public/logs/live_backing.log?AWSAccessKeyId=********************&Content-Type=text%2Fplain%3B%20charset%3Dutf-8&Expires=1556539746&Signature=o8DjMACGbgq74wwvM1Abu26AKAo%3D 
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Response 
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: HTTP/1.1 200 OK  Content-Length: 0  Date: Mon, 29 Apr 2019 11:23:57 GMT  Etag: "cdc778e8c0267ab5a946c09f4d79155d"  Server: AmazonS3  X-Amz-Id-2: eOQgeGkFChEl0FYRYFcdLOewiHycN4NuQ7qOhGvk8YfD9eaIvqx4fhiPUjfdxIbplPgBa9L8j/0=  X-Amz-Request-Id: 033A7AE1DE1CCE11  X-Amz-Version-Id: YBOcbpQJv8jJH9yRj574k_cXoot8CJrO   
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Resolving task AByVjWqKT26vrLgc7GobNA ... 
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com generic-worker: Task AByVjWqKT26vrLgc7GobNA finished successfully! 
Apr 29 13:23:57 i-0687324357b79b3f1.gecko-t-win7-32.usw2.mozilla.com USER32: The process C:\windows\system32\shutdown.exe (I-0687324357B79) has initiated the restart of computer I-0687324357B79 on behalf of user NT AUTHORITY\SYSTEM for the following reason: Application: Maintenance (Planned)   Reason Code: 0x80040001   Shutdown Type: restart   Comment: rebooting; generic worker task run completed 
```
