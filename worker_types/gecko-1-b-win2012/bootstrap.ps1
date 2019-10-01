###################################################################################
# Note, this powershell script is an *APPROXIMATION ONLY* to the steps that are run
# to build the AMIs for aws-provisioner-v1/gecko-1-b-win2012.
#
# The authoratative host definition can be found at:
#
#   * https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Manifest/gecko-1-b-win2012.json
#
###################################################################################

# use TLS 1.2 (see bug 1443595)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# capture env
Get-ChildItem Env: | Out-File "C:\install_env.txt"

# needed for making http requests
$client = New-Object system.net.WebClient
$shell = new-object -com shell.application

# utility function to download a zip file and extract it
function Extract-ZIPFile($file, $destination, $url)
{
    $client.DownloadFile($url, $file)
    $zip = $shell.NameSpace($file)
    foreach($item in $zip.items())
    {
        $shell.Namespace($destination).copyhere($item)
    }
}

md C:\logs
md C:\binaries

# LogDirectory: Required by OpenCloudConfig for DSC logging
md "C:\log"

# NxLog: Maintenance Toolchain - forwards event logs to papertrail
$client.DownloadFile("https://nxlog.co/system/files/products/files/348/nxlog-ce-2.10.2150.msi", "C:\binaries\nxlog-ce-2.10.2150.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\nxlog-ce-2.10.2150.msi /quiet" -Wait -NoNewWindow

# PaperTrailEncryptionCertificate: Maintenance Toolchain - not essential for building firefox
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/nxlog/papertrail-bundle.pem", "C:\Program Files (x86)\nxlog\cert\papertrail-bundle.pem")

# NxLogPaperTrailConfiguration: Maintenance Toolchain - not essential for building firefox
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/nxlog/win2012.conf", "C:\Program Files (x86)\nxlog\conf\nxlog.conf")

# Start_nxlog: Maintenance Toolchain - not essential for building firefox
Set-Service "nxlog" -StartupType Automatic -Status Running

# DisableIndexing: Disable indexing on all disk volumes (for performance)
Get-WmiObject Win32_Volume -Filter "IndexingEnabled=$true" | Set-WmiInstance -Arguments @{IndexingEnabled=$false}

# ProcessExplorer: Maintenance Toolchain - not essential for building firefox
New-Item -ItemType Directory -Force -Path "C:\ProcessExplorer"
Extract-ZIPFile -File "C:\binaries\ProcessExplorer.zip" -Destination "C:\ProcessExplorer" -Url "https://s3.amazonaws.com/windows-opencloudconfig-packages/ProcessExplorer/ProcessExplorer.zip"

# ProcessMonitor: Maintenance Toolchain - not essential for building firefox
New-Item -ItemType Directory -Force -Path "C:\ProcessMonitor"
Extract-ZIPFile -File "C:\binaries\ProcessMonitor.zip" -Destination "C:\ProcessMonitor" -Url "https://s3.amazonaws.com/windows-opencloudconfig-packages/ProcessMonitor/ProcessMonitor.zip"

# GpgForWin: Maintenance Toolchain - not essential for building firefox
$client.DownloadFile("http://files.gpg4win.org/gpg4win-2.3.0.exe", "C:\binaries\gpg4win-2.3.0.exe")
Start-Process "C:\binaries\gpg4win-2.3.0.exe" -ArgumentList "/S" -Wait -NoNewWindow

# SevenZip: Maintenance Toolchain - not essential for building firefox
$client.DownloadFile("http://7-zip.org/a/7z1514-x64.exe", "C:\binaries\7z1514-x64.exe")
Start-Process "C:\binaries\7z1514-x64.exe" -ArgumentList "/S" -Wait -NoNewWindow

# SublimeText3: Maintenance Toolchain - not essential for building firefox
$client.DownloadFile("https://download.sublimetext.com/Sublime%20Text%20Build%203114%20x64%20Setup.exe", "C:\binaries\Sublime Text Build 3114 x64 Setup.exe")
Start-Process "C:\binaries\Sublime Text Build 3114 x64 Setup.exe" -ArgumentList "/VERYSILENT /NORESTART /TASKS=`"contextentry`"" -Wait -NoNewWindow

# SublimeText3_PackagesFolder: Maintenance Toolchain - not essential for building firefox
md "C:\Users\Administrator\AppData\Roaming\Sublime Text 3\Packages"

# SublimeText3_PackageControl: Maintenance Toolchain - not essential for building firefox
$client.DownloadFile("http://sublime.wbond.net/Package%20Control.sublime-package", "C:\Users\Administrator\AppData\Roaming\Sublime Text 3\Packages\Package Control.sublime-package")

# SystemPowerShellProfile: Maintenance Toolchain - not essential for building firefox
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/Microsoft.PowerShell_profile.ps1", "C:\Windows\System32\WindowsPowerShell\v1.0\Microsoft.PowerShell_profile.ps1")

# FsutilDisable8Dot3: Maintenance Toolchain - not essential for building firefox
Start-Process "fsutil.exe" -ArgumentList "behavior set disable8dot3 1" -Wait -NoNewWindow

# FsutilDisableLastAccess: Maintenance Toolchain - not essential for building firefox
Start-Process "fsutil.exe" -ArgumentList "behavior set disablelastaccess 1" -Wait -NoNewWindow

# home: Maintenance Toolchain - not essential for building firefox
cmd /c mklink "C:\home" "C:\Users"

# Start_wuauserv: Required by NET-Framework-Core
Set-Service "wuauserv" -StartupType Manual -Status Running

# NET_Framework_Core: Required by DXSDK_Jun10
Install-WindowsFeature NET-Framework-Core

# VisualC2010RedistributablePackageX86Uninstall: Required by DXSDK_Jun10 (https://blogs.msdn.microsoft.com/chuckw/2011/12/09/known-issue-directx-sdk-june-2010-setup-and-the-s1023-error)
Start-Process "msiexec.exe" -ArgumentList "/passive /uninstall {F0C3E5D1-1ADE-321E-8167-68EF0DE699A5}" -Wait -NoNewWindow

# VisualC2010RedistributablePackageX86_64Uninstall: Required by DXSDK_Jun10 (https://blogs.msdn.microsoft.com/chuckw/2011/12/09/known-issue-directx-sdk-june-2010-setup-and-the-s1023-error)
Start-Process "msiexec.exe" -ArgumentList "/passive /uninstall {1D8E6291-B0D5-35EC-8441-6616F567A0F7}" -Wait -NoNewWindow

# DXSDK_Jun10: Provides D3D compilers required by 32 bit builds
$client.DownloadFile("http://download.microsoft.com/download/A/E/7/AE743F1F-632B-4809-87A9-AA1BB3458E31/DXSDK_Jun10.exe", "C:\binaries\DXSDK_Jun10.exe")
Start-Process "C:\binaries\DXSDK_Jun10.exe" -ArgumentList "/U" -Wait -NoNewWindow

# vcredist_vs2010_x86: Required by yasm (c:/mozilla-build/yasm/yasm.exe)
$client.DownloadFile("http://download.microsoft.com/download/C/6/D/C6D0FD4E-9E53-4897-9B91-836EBA2AACD3/vcredist_x86.exe", "C:\binaries\vcredist_x86.exe")
Start-Process "C:\binaries\vcredist_x86.exe" -ArgumentList "/install /passive /norestart /log C:\log\vcredist_vs2010_x86-install.log" -Wait -NoNewWindow

# vcredist_vs2010_x64: Required by yasm (c:/mozilla-build/yasm/yasm.exe)
$client.DownloadFile("http://download.microsoft.com/download/A/8/0/A80747C3-41BD-45DF-B505-E9710D2744E0/vcredist_x64.exe", "C:\binaries\vcredist_x64.exe")
Start-Process "C:\binaries\vcredist_x64.exe" -ArgumentList "/install /passive /norestart /log C:\log\vcredist_vs2010_x64-install.log" -Wait -NoNewWindow

# vcredist_vs2013_x86: Required by rustc (tooltool artefact)
$client.DownloadFile("http://download.microsoft.com/download/2/E/6/2E61CFA4-993B-4DD4-91DA-3737CD5CD6E3/vcredist_x86.exe", "C:\binaries\vcredist_x86.exe")
Start-Process "C:\binaries\vcredist_x86.exe" -ArgumentList "/install /passive /norestart /log C:\log\vcredist_vs2013_x86-install.log" -Wait -NoNewWindow

# vcredist_vs2013_x64: Required by rustc (tooltool artefact)
$client.DownloadFile("http://download.microsoft.com/download/2/E/6/2E61CFA4-993B-4DD4-91DA-3737CD5CD6E3/vcredist_x64.exe", "C:\binaries\vcredist_x64.exe")
Start-Process "C:\binaries\vcredist_x64.exe" -ArgumentList "/install /passive /norestart /log C:\log\vcredist_vs2013_x64-install.log" -Wait -NoNewWindow

# vcredist_vs2015_x86: Required by rustc (tooltool artefact)
$client.DownloadFile("http://download.microsoft.com/download/f/3/9/f39b30ec-f8ef-4ba3-8cb4-e301fcf0e0aa/vc_redist.x86.exe", "C:\binaries\vc_redist.x86.exe")
Start-Process "C:\binaries\vc_redist.x86.exe" -ArgumentList "/install /passive /norestart /log C:\log\vcredist_vs2015_x86-install.log" -Wait -NoNewWindow

# vcredist_vs2015_x64: Required by rustc (tooltool artefact)
$client.DownloadFile("http://download.microsoft.com/download/4/c/b/4cbd5757-0dd4-43a7-bac0-2a492cedbacb/vc_redist.x64.exe", "C:\binaries\vc_redist.x64.exe")
Start-Process "C:\binaries\vc_redist.x64.exe" -ArgumentList "/install /passive /norestart /log C:\log\vcredist_vs2015_x64-install.log" -Wait -NoNewWindow

# WindowsSDK10Setup
$client.DownloadFile("https://go.microsoft.com/fwlink/p/?LinkID=698771", "C:\binaries\sdksetup.exe")
Start-Process "C:\binaries\sdksetup.exe" -ArgumentList "/features + /quiet /norestart /ceip off /log C:\log\windowssdk10setup.log" -Wait -NoNewWindow

# BinScope: https://dxr.mozilla.org/mozilla-central/search?q=BinScope&redirect=false&case=false
$client.DownloadFile("https://s3.amazonaws.com/windows-opencloudconfig-packages/binscope/BinScope_x64.msi", "C:\binaries\BinScope_x64.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\BinScope_x64.msi /quiet" -Wait -NoNewWindow

# MozillaBuildSetup: https://bugzilla.mozilla.org/show_bug.cgi?id=1461340
$client.DownloadFile("http://ftp.mozilla.org/pub/mozilla/libraries/win32/MozillaBuildSetup-3.2.exe", "C:\binaries\MozillaBuildSetup-3.2.exe")
Start-Process "C:\binaries\MozillaBuildSetup-3.2.exe" -ArgumentList "/S /D=C:\mozilla-build" -Wait -NoNewWindow

# DeleteMozillaBuildPython3PythonExe
Start-Process "cmd.exe" -ArgumentList "/c del /F /Q C:\mozilla-build\python3\python.exe" -Wait -NoNewWindow

# msys_home: Maintenance Toolchain - not essential for building firefox
cmd /c mklink "C:\mozilla-build\msys\home" "C:\Users"

# DeleteMozillaBuildMercurial
Start-Process "cmd.exe" -ArgumentList "/c del C:\mozilla-build\python\Scripts\hg*" -Wait -NoNewWindow

# Mercurial: https://bugzilla.mozilla.org/show_bug.cgi?id=1490703
$client.DownloadFile("https://www.mercurial-scm.org/release/windows/mercurial-4.7.1-x64.msi", "C:\binaries\mercurial-4.7.1-x64.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\mercurial-4.7.1-x64.msi /quiet" -Wait -NoNewWindow

# MercurialConfig: Required by clonebundle and share hg extensions
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/Mercurial/mercurial.ini", "C:\Program Files\Mercurial\Mercurial.ini")

# robustcheckout: Required by robustcheckout hg extension
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/FirefoxBuildResources/robustcheckout.py", "C:\mozilla-build\robustcheckout.py")

# MercurialCerts
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/Mercurial/cacert.pem", "C:\mozilla-build\msys\etc\cacert.pem")

# env_MOZILLABUILD: Absolutely required for mozharness builds. Python will fall in a heap, throwing misleading exceptions without this. :)
[Environment]::SetEnvironmentVariable("MOZILLABUILD", "C:\mozilla-build", "Machine")

# pip_upgrade_pip
Start-Process "C:\mozilla-build\python\python.exe" -ArgumentList "-m pip install --upgrade pip==8.1.2" -Wait -NoNewWindow

# pip_upgrade_setuptools
Start-Process "C:\mozilla-build\python\python.exe" -ArgumentList "-m pip install --upgrade setuptools==20.7.0" -Wait -NoNewWindow

# pip_upgrade_virtualenv
Start-Process "C:\mozilla-build\python\python.exe" -ArgumentList "-m pip install --upgrade virtualenv==15.0.1" -Wait -NoNewWindow

# pip_upgrade_wheel
Start-Process "C:\mozilla-build\python\python.exe" -ArgumentList "-m pip install --upgrade wheel==0.29.0" -Wait -NoNewWindow

# pip_upgrade_pypiwin32
Start-Process "C:\mozilla-build\python\python.exe" -ArgumentList "-m pip install --upgrade pypiwin32==219" -Wait -NoNewWindow

# pip_upgrade_requests
Start-Process "C:\mozilla-build\python\python.exe" -ArgumentList "-m pip install --upgrade requests==2.8.1" -Wait -NoNewWindow

# pip_upgrade_psutil
Start-Process "C:\mozilla-build\python\python.exe" -ArgumentList "-m pip install --upgrade psutil==4.1.0" -Wait -NoNewWindow

# pip3_upgrade_pip
Start-Process "C:\mozilla-build\python3\python3.exe" -ArgumentList "-m pip install --upgrade pip==19.2.1" -Wait -NoNewWindow

# pip3_upgrade_zstandard
Start-Process "C:\mozilla-build\python3\python3.exe" -ArgumentList "-m pip install --upgrade zstandard==0.11.1" -Wait -NoNewWindow

# ToolToolInstall
$client.DownloadFile("https://raw.githubusercontent.com/mozilla/release-services/master/src/tooltool/client/tooltool.py", "C:\mozilla-build\tooltool.py")

# dir_TOOLTOOL_CACHE
md "Y:\tooltool_cache"

# env_TOOLTOOL_CACHE: Tells the build system where to find the local tooltool cache
[Environment]::SetEnvironmentVariable("TOOLTOOL_CACHE", "Y:\tooltool_cache", "Machine")

# link_TOOLTOOL_CACHE: Provides backwards compatibility to hardcoded cache paths
cmd /c mklink "C:\builds\tooltool_cache" "Y:\tooltool_cache"

# ToolToolCacheAccessRights: https://bugzilla.mozilla.org/show_bug.cgi?id=1421114
Start-Process "icacls.exe" -ArgumentList "Y:\tooltool_cache /grant Everyone:(OI)(CI)F" -Wait -NoNewWindow

# env_PATH
[Environment]::SetEnvironmentVariable("PATH", "C:\Program Files\Mercurial;C:\mozilla-build\bin;C:\mozilla-build\kdiff3;C:\mozilla-build\moztools-x64\bin;C:\mozilla-build\mozmake;C:\mozilla-build\msys\bin;C:\mozilla-build\msys\local\bin;C:\mozilla-build\nsis-3.01;C:\mozilla-build\python;C:\mozilla-build\python\Scripts;C:\mozilla-build\python3;%PATH%", "Machine")

# reg_WindowsErrorReportingLocalDumps: https://bugzilla.mozilla.org/show_bug.cgi?id=1261812
New-Item -Path "HKLM:SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps" -Force

# reg_WindowsErrorReportingDontShowUI: https://bugzilla.mozilla.org/show_bug.cgi?id=1261812
New-ItemProperty -Path "HKLM:SOFTWARE\Microsoft\Windows\Windows Error Reporting" -Name "DontShowUI" -Value "0x00000001" -PropertyType Dword -Force

# env_DXSDK_DIR
[Environment]::SetEnvironmentVariable("DXSDK_DIR", "C:\Program Files (x86)\Microsoft DirectX SDK (June 2010)", "Machine")

# GenericWorkerDirectory
md "C:\generic-worker"

# GenericWorkerDownload
$client.DownloadFile("https://github.com/taskcluster/generic-worker/releases/download/v16.2.0/generic-worker-multiuser-windows-amd64.exe", "C:\generic-worker\generic-worker.exe")

# LiveLogDownload
$client.DownloadFile("https://github.com/taskcluster/livelog/releases/download/v1.1.0/livelog-windows-amd64.exe", "C:\generic-worker\livelog.exe")

# TaskClusterProxyDownload
$client.DownloadFile("https://github.com/taskcluster/taskcluster-proxy/releases/download/v5.1.0/taskcluster-proxy-windows-amd64.exe", "C:\generic-worker\taskcluster-proxy.exe")

# NSSMDownload
$client.DownloadFile("https://nssm.cc/ci/nssm-2.24-103-gdee49fc.zip", "C:\Windows\Temp\NSSMInstall.zip")

# NSSMInstall: NSSM is required to install Generic Worker as a service. Currently ZipInstall fails, so using 7z instead.
Start-Process "C:\Program Files\7-Zip\7z.exe" -ArgumentList "x -oC:\ C:\Windows\Temp\NSSMInstall.zip" -Wait -NoNewWindow

# GenericWorkerInstall
Start-Process "C:\generic-worker\generic-worker.exe" -ArgumentList "install service --nssm C:\nssm-2.24-103-gdee49fc\win64\nssm.exe --config C:\generic-worker\generic-worker.config --configure-for-%MY_CLOUD%" -Wait -NoNewWindow

# GenericWorkerStateWait
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/GenericWorker/run-generic-worker-and-reboot.bat", "C:\generic-worker\run-generic-worker.bat")

# TaskUserInitScript: Bug 1433851 - wait for user registry to initialise before running a task
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/GenericWorker/task-user-init-win2012.cmd", "C:\generic-worker\task-user-init.cmd")

# HgShared: allows builds to use `hg robustcheckout ...`
md "y:\hg-shared"

# HgSharedAccessRights: allows builds to use `hg robustcheckout ...`
Start-Process "icacls.exe" -ArgumentList "y:\hg-shared /grant Everyone:(OI)(CI)F" -Wait -NoNewWindow

# LegacyHgShared: allows builds to use `hg share ...`
md "c:\builds\hg-shared"

# LegacyHgSharedAccessRights: allows builds to use `hg share ...`
Start-Process "icacls.exe" -ArgumentList "c:\builds\hg-shared /grant Everyone:(OI)(CI)F" -Wait -NoNewWindow

# CarbonClone: Bug 1316329 - support creation of symlinks by task users
Start-Process "C:\Program Files\Mercurial\hg.exe" -ArgumentList "clone --insecure https://bitbucket.org/splatteredbits/carbon C:\Windows\Temp\carbon" -Wait -NoNewWindow

# CarbonUpdate: Bug 1316329 - support creation of symlinks by task users
Start-Process "C:\Program Files\Mercurial\hg.exe" -ArgumentList "update 2.4.0 -R C:\Windows\Temp\carbon" -Wait -NoNewWindow

# CarbonInstall: Bug 1316329 - support creation of symlinks by task users
Start-Process "xcopy" -ArgumentList "C:\Windows\Temp\carbon\Carbon C:\Windows\System32\WindowsPowerShell\v1.0\Modules\Carbon /e /i /y" -Wait -NoNewWindow

# GrantEveryoneSeCreateSymbolicLinkPrivilege: Bug 1316329 - support creation of symlinks by task users
Start-Process "powershell" -ArgumentList "-command `"& {&'Import-Module' Carbon}`"; `"& {&'Grant-Privilege' -Identity Everyone -Privilege SeCreateSymbolicLinkPrivilege}`"" -Wait -NoNewWindow

# ZDriveAccessRights: allows task users full access to the task drive
Start-Process "icacls.exe" -ArgumentList "z:\ /grant Everyone:(OI)(CI)F" -Wait -NoNewWindow

# KmsIn
New-NetFirewallRule -DisplayName "KmsIn (TCP 1688 Inbound): Allow" -Direction Inbound -LocalPort 1688 -Protocol TCP -Action Allow

# KmsOut
New-NetFirewallRule -DisplayName "KmsOut (TCP 1688 Outbound): Allow" -Direction Outbound -LocalPort 1688 -Protocol TCP -Action Allow

# reg_Power_PreferredPlan_HighPerformance: https://bugzilla.mozilla.org/show_bug.cgi?id=1362613
New-ItemProperty -Path "HKLM:SOFTWARE\Microsoft\Windows\CurrentVersion\explorer\ControlPanel\NameSpace\{025A5937-A6BE-4686-A844-36FE4BEC8B6D}" -Name "PreferredPlan" -Value "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c" -PropertyType String -Force

# OpenSshDownload: https://bugzilla.mozilla.org/show_bug.cgi?id=1454578
$client.DownloadFile("https://github.com/PowerShell/Win32-OpenSSH/releases/download/v7.6.1.0p1-Beta/OpenSSH-Win64.zip", "C:\Windows\Temp\OpenSSH-Win64.zip")

# OpenSshUnzip: https://bugzilla.mozilla.org/show_bug.cgi?id=1454578
Start-Process "C:\Program Files\7-Zip\7z.exe" -ArgumentList "x -o`"C:\Program Files`" C:\Windows\Temp\OpenSSH-Win64.zip" -Wait -NoNewWindow

# SshIn
New-NetFirewallRule -DisplayName "SshIn (TCP 22 Inbound): Allow" -Direction Inbound -LocalPort 22 -Protocol TCP -Action Allow

# InstallOpenSSH: https://bugzilla.mozilla.org/show_bug.cgi?id=1454578
Start-Process "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File `"C:\Program Files\OpenSSH-Win64\install-sshd.ps1`"" -Wait -NoNewWindow

# reg_OpenSSH_DefaultShell: https://bugzilla.mozilla.org/show_bug.cgi?id=1454578
New-ItemProperty -Path "HKLM:SOFTWARE\OpenSSH" -Name "DefaultShell" -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force

# reg_OpenSSH_DefaultShellCommandOption: https://bugzilla.mozilla.org/show_bug.cgi?id=1454578
New-ItemProperty -Path "HKLM:SOFTWARE\OpenSSH" -Name "DefaultShellCommandOption" -Value "/c" -PropertyType String -Force

# AdministratorSshDir: https://bugzilla.mozilla.org/show_bug.cgi?id=1454578
md "C:\Users\Administrator\.ssh"

# AdministratorSshAuthorisedKeys: https://bugzilla.mozilla.org/show_bug.cgi?id=1454578
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/ssh/authorized_keys", "C:\Users\Administrator\.ssh\authorized_keys")

# ProgramDataSshDir: https://bugzilla.mozilla.org/show_bug.cgi?id=1454578
md "C:\ProgramData\ssh"

# sshd_config: https://bugzilla.mozilla.org/show_bug.cgi?id=1464343
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/ssh/sshd_config", "C:\ProgramData\ssh\sshd_config")

# Start_sshd: https://bugzilla.mozilla.org/show_bug.cgi?id=1454578
Set-Service "sshd" -StartupType Automatic -Status Running

# Start_sshagent: https://bugzilla.mozilla.org/show_bug.cgi?id=1454578
Set-Service "ssh-agent" -StartupType Automatic -Status Running

# HostsFile: https://bugzilla.mozilla.org/show_bug.cgi?id=1497308
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/etc/hosts", "C:\Windows\System32\drivers\etc\hosts")

# SetHostsFileContent: https://bugzilla.mozilla.org/show_bug.cgi?id=1497308

# env_TASKCLUSTER_ROOT_URL: https://bugzilla.mozilla.org/show_bug.cgi?id=1551789
[Environment]::SetEnvironmentVariable("TASKCLUSTER_ROOT_URL", "https://taskcluster.net", "Machine")

# now shutdown, in preparation for creating an image
# Stop-Computer isn't working, also not when specifying -AsJob, so reverting to using `shutdown` command instead
#   * https://www.reddit.com/r/PowerShell/comments/65250s/windows_10_creators_update_stopcomputer_not/dgfofug/?st=j1o3oa29&sh=e0c29c6d
#   * https://support.microsoft.com/en-in/help/4014551/description-of-the-security-and-quality-rollup-for-the-net-framework-4
#   * https://support.microsoft.com/en-us/help/4020459
shutdown -s
