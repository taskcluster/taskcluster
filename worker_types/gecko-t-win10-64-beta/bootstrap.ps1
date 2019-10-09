###################################################################################
# Note, this powershell script is an *APPROXIMATION ONLY* to the steps that are run
# to build the AMIs for aws-provisioner-v1/gecko-t-win10-64-beta.
#
# The authoratative host definition can be found at:
#
#   * https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Manifest/gecko-t-win10-64-beta.json
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
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/nxlog/win10.conf", "C:\Program Files (x86)\nxlog\conf\nxlog.conf")

# Start_nxlog: Maintenance Toolchain - not essential for building firefox
Set-Service "nxlog" -StartupType Automatic -Status Running

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

# env_PATH

# pip3_upgrade_pip
Start-Process "C:\mozilla-build\python3\python3.exe" -ArgumentList "-m pip install --upgrade pip==19.2.3" -Wait -NoNewWindow

# pip3_upgrade_zstandard
Start-Process "C:\mozilla-build\python3\python3.exe" -ArgumentList "-m pip install --upgrade zstandard==0.11.1" -Wait -NoNewWindow

# pip3_upgrade_certifi
Start-Process "C:\mozilla-build\python3\python3.exe" -ArgumentList "-m pip install --upgrade certifi" -Wait -NoNewWindow

# ToolToolInstall
$client.DownloadFile("https://raw.githubusercontent.com/mozilla/release-services/master/src/tooltool/client/tooltool.py", "C:\mozilla-build\tooltool.py")

# reg_WindowsErrorReportingLocalDumps: https://bugzilla.mozilla.org/show_bug.cgi?id=1261812
New-Item -Path "HKLM:SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps" -Force

# reg_WindowsErrorReportingDontShowUI: https://bugzilla.mozilla.org/show_bug.cgi?id=1261812
New-ItemProperty -Path "HKLM:SOFTWARE\Microsoft\Windows\Windows Error Reporting" -Name "DontShowUI" -Value "0x00000001" -PropertyType Dword -Force

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

# DisableDesktopInterrupt
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/GenericWorker/disable-desktop-interrupt.reg", "C:\generic-worker\disable-desktop-interrupt.reg")

# SetDefaultPrinter
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/GenericWorker/SetDefaultPrinter.ps1", "C:\generic-worker\SetDefaultPrinter.ps1")

# GenericWorkerStateWait
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/GenericWorker/run-generic-worker-and-reboot.bat", "C:\generic-worker\run-generic-worker.bat")

# TaskUserInitScript: Bug 1261188 - initialisation script for new task users
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/GenericWorker/task-user-init-win10.cmd", "C:\generic-worker\task-user-init.cmd")

# PipConfDirectory: https://pip.pypa.io/en/stable/user_guide/#config-file
md "C:\ProgramData\pip"

# PipConf
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/pip.conf", "C:\ProgramData\pip\pip.ini")

# virtualenv_support
md "C:\mozilla-build\python\Lib\site-packages\virtualenv_support"

# virtualenv_support_pywin32
$client.DownloadFile("https://pypi.python.org/packages/cp27/p/pypiwin32/pypiwin32-219-cp27-none-win32.whl#md5=a8b0c1b608c1afeb18cd38d759ee5e29", "C:\mozilla-build\python\Lib\site-packages\virtualenv_support\pypiwin32-219-cp27-none-win32.whl")

# virtualenv_support_pywin32_amd64
$client.DownloadFile("https://pypi.python.org/packages/cp27/p/pypiwin32/pypiwin32-219-cp27-none-win_amd64.whl#md5=d7bafcf3cce72c3ce9fdd633a262c335", "C:\mozilla-build\python\Lib\site-packages\virtualenv_support\pypiwin32-219-cp27-none-win_amd64.whl")

# HgShared: allows builds to use `hg robustcheckout ...`
md "y:\hg-shared"

# HgSharedAccessRights: allows builds to use `hg robustcheckout ...`
Start-Process "icacls.exe" -ArgumentList "y:\hg-shared /grant Everyone:(OI)(CI)F" -Wait -NoNewWindow

# PipCache: share pip cache across subsequent task users
md "y:\pip-cache"

# PipCacheAccessRights: share pip cache across subsequent task users
Start-Process "icacls.exe" -ArgumentList "y:\pip-cache /grant Everyone:(OI)(CI)F" -Wait -NoNewWindow

# env_PIP_DOWNLOAD_CACHE: share pip download cache between tasks
[Environment]::SetEnvironmentVariable("PIP_DOWNLOAD_CACHE", "y:\pip-cache", "Machine")

# TooltoolCache: share tooltool cache across subsequent task users
md "y:\tooltool-cache"

# TooltoolCacheAccessRights: share tooltool cache across subsequent task users
Start-Process "icacls.exe" -ArgumentList "y:\tooltool-cache /grant Everyone:(OI)(CI)F" -Wait -NoNewWindow

# env_TOOLTOOL_CACHE: share tooltool cache between tasks
[Environment]::SetEnvironmentVariable("TOOLTOOL_CACHE", "y:\tooltool-cache", "Machine")

# CarbonClone: Bug 1316329 - support creation of symlinks by task users
Start-Process "C:\Program Files\Mercurial\hg.exe" -ArgumentList "clone --insecure https://bitbucket.org/splatteredbits/carbon C:\Windows\Temp\carbon" -Wait -NoNewWindow

# CarbonUpdate: Bug 1316329 - support creation of symlinks by task users
Start-Process "C:\Program Files\Mercurial\hg.exe" -ArgumentList "update 2.4.0 -R C:\Windows\Temp\carbon" -Wait -NoNewWindow

# CarbonInstall: Bug 1316329 - support creation of symlinks by task users
Start-Process "xcopy" -ArgumentList "C:\Windows\Temp\carbon\Carbon C:\Windows\System32\WindowsPowerShell\v1.0\Modules\Carbon /e /i /y" -Wait -NoNewWindow

# GrantEveryoneSeCreateSymbolicLinkPrivilege: Bug 1316329 - support creation of symlinks by task users
Start-Process "powershell" -ArgumentList "-command `"& {&'Import-Module' Carbon}`"; `"& {&'Grant-Privilege' -Identity Everyone -Privilege SeCreateSymbolicLinkPrivilege}`"" -Wait -NoNewWindow

# MozillaMaintenanceDir: Working directory for Mozilla Maintenance Service installation
md "C:\dsc\MozillaMaintenance"

# maintenanceservice_installer
$client.DownloadFile("https://github.com/mozilla-releng/OpenCloudConfig/blob/master/userdata/Configuration/Mozilla%20Maintenance%20Service/maintenanceservice_installer.exe?raw=true", "C:\dsc\MozillaMaintenance\maintenanceservice_installer.exe")

# maintenanceservice
$client.DownloadFile("https://github.com/mozilla-releng/OpenCloudConfig/blob/master/userdata/Configuration/Mozilla%20Maintenance%20Service/maintenanceservice.exe?raw=true", "C:\dsc\MozillaMaintenance\maintenanceservice.exe")

# maintenanceservice_install
Start-Process "C:\dsc\MozillaMaintenance\maintenanceservice_installer.exe" -ArgumentList "/s" -Wait -NoNewWindow

# MaintenanceServiceAcessRights: See https://bugzilla.mozilla.org/show_bug.cgi?id=1067756#c21
Start-Process "icacls.exe" -ArgumentList "`"C:\Program Files (x86)\Mozilla Maintenance Service`" /grant Everyone:(OI)(CI)F" -Wait -NoNewWindow

# MozFakeCA_cer
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/Mozilla%20Maintenance%20Service/MozFakeCA.cer", "C:\dsc\MozillaMaintenance\MozFakeCA.cer")

# MozFakeCA_cer
Start-Process "certutil.exe" -ArgumentList "-addstore Root C:\dsc\MozillaMaintenance\MozFakeCA.cer" -Wait -NoNewWindow

# MozFakeCA_2017_10_13_cer
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/Mozilla%20Maintenance%20Service/MozFakeCA_2017-10-13.cer", "C:\dsc\MozillaMaintenance\MozFakeCA_2017-10-13.cer")

# MozFakeCA_2017_10_13_cer
Start-Process "certutil.exe" -ArgumentList "-addstore Root C:\dsc\MozillaMaintenance\MozFakeCA_2017-10-13.cer" -Wait -NoNewWindow

# MozRoot_cer
$client.DownloadFile("https://s3.amazonaws.com/windows-opencloudconfig-packages/certs/MozRoot.cer", "C:\dsc\MozillaMaintenance\MozRoot.cer")

# MozRoot_cer
Start-Process "certutil.exe" -ArgumentList "-addstore Root C:\dsc\MozillaMaintenance\MozRoot.cer" -Wait -NoNewWindow

# reg_Mozilla_MaintenanceService_3932ecacee736d366d6436db0f55bce4_0_name
New-ItemProperty -Path "HKLM:SOFTWARE\Mozilla\MaintenanceService\3932ecacee736d366d6436db0f55bce4\0" -Name "name" -Value "Mozilla Corporation" -PropertyType String -Force

# reg_Mozilla_MaintenanceService_3932ecacee736d366d6436db0f55bce4_0_issuer
New-ItemProperty -Path "HKLM:SOFTWARE\Mozilla\MaintenanceService\3932ecacee736d366d6436db0f55bce4\0" -Name "issuer" -Value "Thawte Code Signing CA - G2" -PropertyType String -Force

# reg_Mozilla_MaintenanceService_3932ecacee736d366d6436db0f55bce4_0_programName
New-ItemProperty -Path "HKLM:SOFTWARE\Mozilla\MaintenanceService\3932ecacee736d366d6436db0f55bce4\0" -Name "programName" -Value "" -PropertyType String -Force

# reg_Mozilla_MaintenanceService_3932ecacee736d366d6436db0f55bce4_0_publisherLink
New-ItemProperty -Path "HKLM:SOFTWARE\Mozilla\MaintenanceService\3932ecacee736d366d6436db0f55bce4\0" -Name "publisherLink" -Value "" -PropertyType String -Force

# reg_Mozilla_MaintenanceService_3932ecacee736d366d6436db0f55bce4_1_name
New-ItemProperty -Path "HKLM:SOFTWARE\Mozilla\MaintenanceService\3932ecacee736d366d6436db0f55bce4\1" -Name "name" -Value "Mozilla Fake SPC" -PropertyType String -Force

# reg_Mozilla_MaintenanceService_3932ecacee736d366d6436db0f55bce4_1_issuer
New-ItemProperty -Path "HKLM:SOFTWARE\Mozilla\MaintenanceService\3932ecacee736d366d6436db0f55bce4\1" -Name "issuer" -Value "Mozilla Fake CA" -PropertyType String -Force

# reg_Mozilla_MaintenanceService_3932ecacee736d366d6436db0f55bce4_1_programName
New-ItemProperty -Path "HKLM:SOFTWARE\Mozilla\MaintenanceService\3932ecacee736d366d6436db0f55bce4\1" -Name "programName" -Value "" -PropertyType String -Force

# reg_Mozilla_MaintenanceService_3932ecacee736d366d6436db0f55bce4_1_publisherLink
New-ItemProperty -Path "HKLM:SOFTWARE\Mozilla\MaintenanceService\3932ecacee736d366d6436db0f55bce4\1" -Name "publisherLink" -Value "" -PropertyType String -Force

# reg_Mozilla_MaintenanceService_3932ecacee736d366d6436db0f55bce4_2_name
New-ItemProperty -Path "HKLM:SOFTWARE\Mozilla\MaintenanceService\3932ecacee736d366d6436db0f55bce4\2" -Name "name" -Value "Mozilla Corporation" -PropertyType String -Force

# reg_Mozilla_MaintenanceService_3932ecacee736d366d6436db0f55bce4_2_issuer
New-ItemProperty -Path "HKLM:SOFTWARE\Mozilla\MaintenanceService\3932ecacee736d366d6436db0f55bce4\2" -Name "issuer" -Value "DigiCert SHA2 Assured ID Code Signing CA" -PropertyType String -Force

# reg_Mozilla_MaintenanceService_3932ecacee736d366d6436db0f55bce4_2_programName
New-ItemProperty -Path "HKLM:SOFTWARE\Mozilla\MaintenanceService\3932ecacee736d366d6436db0f55bce4\2" -Name "programName" -Value "" -PropertyType String -Force

# reg_Mozilla_MaintenanceService_3932ecacee736d366d6436db0f55bce4_2_publisherLink
New-ItemProperty -Path "HKLM:SOFTWARE\Mozilla\MaintenanceService\3932ecacee736d366d6436db0f55bce4\2" -Name "publisherLink" -Value "" -PropertyType String -Force

# GrantEveryoneMozillaRegistryWriteAccess: Bug 1353889 - Grant Everyone group write access to Mozilla registry key
Start-Process "powershell" -ArgumentList "-command `"& {(Get-Acl -Path 'HKLM:\SOFTWARE\Mozilla').SetAccessRule((New-Object -TypeName 'System.Security.AccessControl.RegistryAccessRule' -ArgumentList @('Everyone', 'FullControl', 'Allow')))}`"" -Wait -NoNewWindow

# DisableFirewall: Bug 1358301 - Disable Windows Firewall
Start-Process "netsh" -ArgumentList "advfirewall set allprofiles state off" -Wait -NoNewWindow

# KmsIn
New-NetFirewallRule -DisplayName "KmsIn (TCP 1688 Inbound): Allow" -Direction Inbound -LocalPort 1688 -Protocol TCP -Action Allow

# KmsOut
New-NetFirewallRule -DisplayName "KmsOut (TCP 1688 Outbound): Allow" -Direction Outbound -LocalPort 1688 -Protocol TCP -Action Allow

# nircmd
$client.DownloadFile("https://s3.amazonaws.com/windows-opencloudconfig-packages/nircmd/nircmd.exe", "C:\Windows\System32\nircmd.exe")

# nircmdc
$client.DownloadFile("https://s3.amazonaws.com/windows-opencloudconfig-packages/nircmd/nircmdc.exe", "C:\Windows\System32\nircmdc.exe")

# reg_DisableNewAppAlert: Bug 1373551 - prevent dialog to confirm file association
New-ItemProperty -Path "HKLM:SOFTWARE\Policies\Microsoft\Windows\Explorer" -Name "NoNewAppAlert" -Value "1" -PropertyType Dword -Force

# reg_NewNetworkWindowOff: https://bugzilla.mozilla.org/show_bug.cgi?id=1397201#c58
New-Item -Path "HKLM:System\CurrentControlSet\Control\Network\NewNetworkWindowOff" -Force

# reg_Power_PreferredPlan_HighPerformance: https://bugzilla.mozilla.org/show_bug.cgi?id=1362613
New-ItemProperty -Path "HKLM:SOFTWARE\Microsoft\Windows\CurrentVersion\explorer\ControlPanel\NameSpace\{025A5937-A6BE-4686-A844-36FE4BEC8B6D}" -Name "PreferredPlan" -Value "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c" -PropertyType String -Force

# Reg_WinDefend_DisableConfig: https://bugzilla.mozilla.org/show_bug.cgi?id=1365909
New-ItemProperty -Path "HKLM:SOFTWARE\Policies\Microsoft\Windows Defender" -Name "DisableConfig" -Value "0x00000001" -PropertyType Dword -Force

# Reg_WinDefend_DisableAntiSpyware: https://bugzilla.mozilla.org/show_bug.cgi?id=1365909
New-ItemProperty -Path "HKLM:SOFTWARE\Policies\Microsoft\Windows Defender" -Name "DisableAntiSpyware" -Value "0x00000001" -PropertyType Dword -Force

# RegServiceStartupType_Disabled_wscsvc: https://bugzilla.mozilla.org/show_bug.cgi?id=1509722
New-ItemProperty -Path "HKLM:SYSTEM\CurrentControlSet\Services\wscsvc" -Name "Start" -Value "0x4" -PropertyType Dword -Force

# RegServiceStartupType_Disabled_SecurityHealthService: https://bugzilla.mozilla.org/show_bug.cgi?id=1509722
New-ItemProperty -Path "HKLM:SYSTEM\CurrentControlSet\Services\SecurityHealthService" -Name "Start" -Value "0x4" -PropertyType Dword -Force

# RegServiceStartupType_Disabled_Sense: https://bugzilla.mozilla.org/show_bug.cgi?id=1509722
New-ItemProperty -Path "HKLM:SYSTEM\CurrentControlSet\Services\Sense" -Name "Start" -Value "0x4" -PropertyType Dword -Force

# RegServiceStartupType_Disabled_WdBoot: https://bugzilla.mozilla.org/show_bug.cgi?id=1509722
New-ItemProperty -Path "HKLM:SYSTEM\CurrentControlSet\Services\WdBoot" -Name "Start" -Value "0x4" -PropertyType Dword -Force

# RegServiceStartupType_Disabled_WdFilter: https://bugzilla.mozilla.org/show_bug.cgi?id=1509722
New-ItemProperty -Path "HKLM:SYSTEM\CurrentControlSet\Services\WdFilter" -Name "Start" -Value "0x4" -PropertyType Dword -Force

# RegServiceStartupType_Disabled_WdNisDrv: https://bugzilla.mozilla.org/show_bug.cgi?id=1509722
New-ItemProperty -Path "HKLM:SYSTEM\CurrentControlSet\Services\WdNisDrv" -Name "Start" -Value "0x4" -PropertyType Dword -Force

# RegServiceStartupType_Disabled_WdNisSvc: https://bugzilla.mozilla.org/show_bug.cgi?id=1509722
New-ItemProperty -Path "HKLM:SYSTEM\CurrentControlSet\Services\WdNisSvc" -Name "Start" -Value "0x4" -PropertyType Dword -Force

# RegServiceStartupType_Disabled_WinDefend: https://bugzilla.mozilla.org/show_bug.cgi?id=1509722
New-ItemProperty -Path "HKLM:SYSTEM\CurrentControlSet\Services\WinDefend" -Name "Start" -Value "0x4" -PropertyType Dword -Force

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

# vcredist_vs2015_x86: https://bugzilla.mozilla.org/show_bug.cgi?id=1460042
$client.DownloadFile("http://download.microsoft.com/download/f/3/9/f39b30ec-f8ef-4ba3-8cb4-e301fcf0e0aa/vc_redist.x86.exe", "C:\binaries\vc_redist.x86.exe")
Start-Process "C:\binaries\vc_redist.x86.exe" -ArgumentList "/install /passive /norestart /log C:\log\vcredist_vs2015_x86-install.log" -Wait -NoNewWindow

# vcredist_vs2015_x64: https://bugzilla.mozilla.org/show_bug.cgi?id=1460042
$client.DownloadFile("http://download.microsoft.com/download/4/c/b/4cbd5757-0dd4-43a7-bac0-2a492cedbacb/vc_redist.x64.exe", "C:\binaries\vc_redist.x64.exe")
Start-Process "C:\binaries\vc_redist.x64.exe" -ArgumentList "/install /passive /norestart /log C:\log\vcredist_vs2015_x64-install.log" -Wait -NoNewWindow

# WindowsPerformanceToolkit: https://bugzilla.mozilla.org/show_bug.cgi?id=1485757
$client.DownloadFile("https://s3.amazonaws.com/windows-opencloudconfig-packages/WindowsPerformanceToolkit/WPTx64-x86_en-us.msi", "C:\binaries\WPTx64-x86_en-us.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\WPTx64-x86_en-us.msi /quiet" -Wait -NoNewWindow

# mozprofilerprobe: https://bugzilla.mozilla.org/show_bug.cgi?id=1485757
$client.DownloadFile("http://hg.mozilla.org/mozilla-central/raw-file/360ab7771e27/toolkit/components/startup/mozprofilerprobe.mof", "C:\Program Files (x86)\Windows Kits\10\Windows Performance Toolkit\mozprofilerprobe.mof")

# mofcomp_mozprofilerprobe: https://bugzilla.mozilla.org/show_bug.cgi?id=1485757
Start-Process "mofcomp" -ArgumentList "`"C:\Program Files (x86)\Windows Kits\10\Windows Performance Toolkit\mozprofilerprobe.mof`"" -Wait -NoNewWindow

# ProgramData_Mozilla_AccessRights: https://bugzilla.mozilla.org/show_bug.cgi?id=1494048
Start-Process "icacls.exe" -ArgumentList "C:\ProgramData\Mozilla /grant Everyone:(OI)(CI)F" -Wait -NoNewWindow

# HostsFile: https://bugzilla.mozilla.org/show_bug.cgi?id=1497308
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/etc/hosts", "C:\Windows\System32\drivers\etc\hosts")

# SetHostsFileContent: https://bugzilla.mozilla.org/show_bug.cgi?id=1497308

# reg_WindowsUpdate_DeferUpgrade: https://bugzilla.mozilla.org/show_bug.cgi?id=1510220
New-ItemProperty -Path "HKLM:SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate" -Name "DeferUpgrade" -Value "1" -PropertyType Dword -Force

# reg_WindowsUpdate_DeferUpgradePeriod: https://bugzilla.mozilla.org/show_bug.cgi?id=1510220
New-ItemProperty -Path "HKLM:SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate" -Name "DeferUpgradePeriod" -Value "8" -PropertyType Dword -Force

# reg_WindowsUpdate_DeferUpdatePeriod: https://bugzilla.mozilla.org/show_bug.cgi?id=1510220
New-ItemProperty -Path "HKLM:SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate" -Name "DeferUpdatePeriod" -Value "4" -PropertyType Dword -Force

# reg_WindowsUpdate_AU_NoAutoRebootWithLoggedOnUsers: https://bugzilla.mozilla.org/show_bug.cgi?id=1485628
New-ItemProperty -Path "HKLM:SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" -Name "NoAutoRebootWithLoggedOnUsers" -Value "1" -PropertyType Dword -Force

# reg_WindowsUpdate_AU_NoAutoUpdate: https://bugzilla.mozilla.org/show_bug.cgi?id=1485628
New-ItemProperty -Path "HKLM:SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" -Name "NoAutoUpdate" -Value "1" -PropertyType Dword -Force

# reg_WindowsUpdate_AU_AUOptions: https://bugzilla.mozilla.org/show_bug.cgi?id=1485628
New-ItemProperty -Path "HKLM:SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" -Name "AUOptions" -Value "1" -PropertyType Dword -Force

# reg_WindowsUpdate_AU_ScheduledInstallDay: https://bugzilla.mozilla.org/show_bug.cgi?id=1485628
New-ItemProperty -Path "HKLM:SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" -Name "ScheduledInstallDay" -Value "1" -PropertyType Dword -Force

# reg_WindowsUpdate_AU_ScheduledInstallTime: https://bugzilla.mozilla.org/show_bug.cgi?id=1485628
New-ItemProperty -Path "HKLM:SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" -Name "ScheduledInstallTime" -Value "1" -PropertyType Dword -Force

# reg_WindowsUpdate_AU_AutomaticMaintenanceEnabled: https://bugzilla.mozilla.org/show_bug.cgi?id=1485628
New-ItemProperty -Path "HKLM:SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" -Name "AutomaticMaintenanceEnabled" -Value "0" -PropertyType Dword -Force

# reg_WindowsUpdate_AU_AllowMUUpdateService: https://bugzilla.mozilla.org/show_bug.cgi?id=1485628
New-ItemProperty -Path "HKLM:SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" -Name "AllowMUUpdateService" -Value "0" -PropertyType Dword -Force

# reg_ScheduleMaintenance_MaintenanceDisabled: https://bugzilla.mozilla.org/show_bug.cgi?id=1485628
New-ItemProperty -Path "HKLM:SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\Maintenance" -Name "MaintenanceDisabled" -Value "1" -PropertyType Dword -Force

# env_TASKCLUSTER_ROOT_URL: https://bugzilla.mozilla.org/show_bug.cgi?id=1551789
[Environment]::SetEnvironmentVariable("TASKCLUSTER_ROOT_URL", "https://taskcluster.net", "Machine")

# now shutdown, in preparation for creating an image
# Stop-Computer isn't working, also not when specifying -AsJob, so reverting to using `shutdown` command instead
#   * https://www.reddit.com/r/PowerShell/comments/65250s/windows_10_creators_update_stopcomputer_not/dgfofug/?st=j1o3oa29&sh=e0c29c6d
#   * https://support.microsoft.com/en-in/help/4014551/description-of-the-security-and-quality-rollup-for-the-net-framework-4
#   * https://support.microsoft.com/en-us/help/4020459
shutdown -s
