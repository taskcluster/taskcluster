# Windows installation notes.

I've been working on Windows 2008 R2 (amd64). Here are my installation notes, that need to be converted to startup scripts integrated with UserData etc.


## Base AMI

Taken from b-2008-ec2-gold_post_puppet_pmoore.try.releng.use1.mozilla.com (ami-e302e388) kindly created by Mark Cornmesser.


## Optional steps (so that we can run go builds in taskcluster - otherwise not needed)

```
c:\generic-worker>wget --no-check-certificate https://storage.googleapis.com/golang/go1.4.2.windows-386.zip
c:\generic-worker>c:\mozilla-build\7zip\7z.exe x go1.4.2.windows-386.zip
c:\generic-worker>setx /M GOROOT C:\generic-worker\go
c:\generic-worker>setx /M PATH "%PATH%;C:\generic-worker\go\bin;C:\mozilla-build\Git\bin"
c:\generic-worker>setx GOPATH C:\generic-worker\gopath
c:\generic-worker>mkdir gopath
```


## Configuration

This file needs to be correctly populated:

```
C:\generic-worker>cat c:\generic-worker\generic-worker.config
{
    "provisioner_id":                  "aws-provisioner-v1",
    "refresh_urls_prematurely_secs":   310,
    "access_token":                    "********************************************",
    "client_id":                       "********************************************",
    "worker_group":                    "********************************************",
    "worker_id":                       "********************************************",
    "worker_type":                     "********************************************",
    "debug":                           "*"
}
```


## Installation of Generic Worker

```
c:\mozilla-build>mkdir C:\generic-worker
c:\mozilla-build>wget --no-check-certificate https://github.com/taskcluster/generic-worker/releases/download/v1.0.3/generic-worker-windows-amd64.exe -O C:\generic-worker\generic-worker.exe
c:\mozilla-build>wget --no-check-certificate https://download.sysinternals.com/files/PSTools.zip
c:\mozilla-build>wget http://www.nssm.cc/release/nssm-2.24.zip
c:\mozilla-build>7zip\7z.exe x nssm-2.24.zip
c:\mozilla-build>7zip\7z.exe x -oC:\generic-worker PSTools.zip PsExec.exe

c:\mozilla-build>nssm-2.24\win64\nssm.exe install "Generic Worker" C:\generic-worker\generic-worker.exe
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppDirectory C:\generic-worker
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppParameters --config C:\generic-worker\generic-worker.config run
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" DisplayName Generic Worker
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" Description A taskcluster worker that runs on all mainstream platforms
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" Start SERVICE_AUTO_START
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" ObjectName .\cltbld *** P A S S W O R D ***
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" Type SERVICE_WIN32_OWN_PROCESS
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppPriority NORMAL_PRIORITY_CLASS
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppNoConsole 1
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppAffinity All
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppStopMethodSkip 0
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppStopMethodConsole 1500
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppStopMethodWindow 1500
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppStopMethodThreads 1500
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppThrottle 1500
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppExit Default Restart
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppRestartDelay 0
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppStdout C:\generic-worker\generic-worker.log
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppStderr C:\generic-worker\generic-worker.log
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppStdoutCreationDisposition 4
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppStderrCreationDisposition 4
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppRotateFiles 1
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppRotateOnline 1
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppRotateSeconds 3600
c:\mozilla-build>nssm-2.24\win64\nssm.exe set "Generic Worker" AppRotateBytes 0
```


## Starting Generic Worker Windows service

```
c:\mozilla-build>nssm-2.24\win64\nssm.exe start "Generic Worker"
```


## User Data

In this extract, I download the generic worker, run it with the `install` argument, and keep logs. All files get placed in C:\generic-worker ...

```powershell
<powershell>

$client = New-Object system.net.WebClient;

function Expand-ZIPFile($file, $destination, $url)
{
    $client.DownloadFile($url, $file)
    $shell = new-object -com shell.application
    $zip = $shell.NameSpace($file)
    foreach($item in $zip.items())
    {
        $shell.Namespace($destination).copyhere($item)
    }
}

# install go
md "C:\gopath"
Expand-ZIPFile -File "C:\go1.4.2.windows-amd64.zip" -Destination "C:\" -Url "https://storage.googleapis.com/golang/go1.4.2.windows-amd64.zip"

# install PSTools
md "C:\PSTools"
Expand-ZIPFile -File "C:\PSTools\PSTools.zip" -Destination "C:\PSTools" -Url "https://download.sysinternals.com/files/PSTools.zip"

# install nssm
Expand-ZIPFile -File "C:\nssm-2.24.zip" -Destination "C:\" -Url "http://www.nssm.cc/release/nssm-2.24.zip"

# install git
$client.DownloadFile("https://github.com/msysgit/msysgit/releases/download/Git-1.9.5-preview20150319/Git-1.9.5-preview20150319.exe", "C:\git-1.9.5-installer.exe")
$p = Start-Process "C:\git-1.9.5-installer.exe" -ArgumentList "/SILENT" -Wait -PassThru
$p.HasExited

# set env vars
[Environment]::SetEnvironmentVariable("GOROOT", "C:\go", "Machine")
[System.Environment]::SetEnvironmentVariable("PATH", $Env:Path + ";C:\go\bin;C:\Program Files (x86)\Git\cmd", "Machine")
[Environment]::SetEnvironmentVariable("GOPATH", "C:\gopath", "User")

# download generic-worker
md C:\generic-worker
$client.DownloadFile("https://github.com/taskcluster/generic-worker/releases/download/v1.0.3/generic-worker-windows-amd64.exe", "C:\generic-worker\generic-worker.exe")

# install generic-worker
$p = Start-Process C:\generic-worker\generic-worker.exe -ArgumentList "install --configure-for-aws --config C:\\generic-worker\\generic-worker.config" -wait -NoNewWindow -PassThru -RedirectStandardOutput C:\generic-worker\install.log -RedirectStandardError C:\generic-worker\install.err
$p.HasExited
</powershell>
```
