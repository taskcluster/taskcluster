###################################################################################
# Note, this powershell script is an *APPROXIMATION ONLY* to the steps that are run
# to build the AMIs for aws-provisioner-v1/gecko-t-win7-32.
#
# The authoratative host definition can be found at:
#
#   * https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Manifest/gecko-t-win7-32.json
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

# KillXenDPriv.exe: See https://bugzilla.mozilla.org/show_bug.cgi?id=1399401#c43 and https://bugzilla.mozilla.org/show_bug.cgi?id=1394757
Start-Process "taskkill" -ArgumentList "/im XenDPriv.exe /f" -Wait -NoNewWindow

# DeleteXenDPriv.exe: See https://bugzilla.mozilla.org/show_bug.cgi?id=1399401#c43 and https://bugzilla.mozilla.org/show_bug.cgi?id=1394757
Start-Process "cmd.exe" -ArgumentList "/c del /f /q `"C:\Program Files\Citrix\XenTools\XenDPriv.exe`"" -Wait -NoNewWindow

# LogDirectory: Required by OpenCloudConfig for DSC logging
md "C:\log"

# StackdriverLogging: https://bugzilla.mozilla.org/show_bug.cgi?id=1588757
$client.DownloadFile("https://dl.google.com/cloudagents/windows/StackdriverLogging-v1-9.exe", "C:\binaries\StackdriverLogging-v1-9.exe")
Start-Process "C:\binaries\StackdriverLogging-v1-9.exe" -ArgumentList "/S" -Wait -NoNewWindow

# fluentd_gw_exe: https://bugzilla.mozilla.org/show_bug.cgi?id=1588757
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/fluentd/gw.exe.conf", "C:\Program Files\Stackdriver\LoggingAgent\config.d\gw.exe.conf")

# fluentd_gw_service: https://bugzilla.mozilla.org/show_bug.cgi?id=1588757
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/fluentd/gw.service.conf", "C:\Program Files\Stackdriver\LoggingAgent\config.d\gw.service.conf")

# fluentd_gw_wrapper: https://bugzilla.mozilla.org/show_bug.cgi?id=1588757
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/fluentd/gw.wrapper.conf", "C:\Program Files\Stackdriver\LoggingAgent\config.d\gw.wrapper.conf")

# fluentd_occ: https://bugzilla.mozilla.org/show_bug.cgi?id=1588757
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/fluentd/occ.conf", "C:\Program Files\Stackdriver\LoggingAgent\config.d\occ.conf")

# fluentd_redact: https://bugzilla.mozilla.org/show_bug.cgi?id=1588757
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/fluentd/redact.conf", "C:\Program Files\Stackdriver\LoggingAgent\config.d\redact.conf")

# NxLog: Maintenance Toolchain - forwards event logs to papertrail
$client.DownloadFile("https://nxlog.co/system/files/products/files/348/nxlog-ce-2.10.2150.msi", "C:\binaries\nxlog-ce-2.10.2150.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\nxlog-ce-2.10.2150.msi /quiet" -Wait -NoNewWindow

# PaperTrailEncryptionCertificate: Maintenance Toolchain - not essential for building firefox
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/nxlog/papertrail-bundle.pem", "C:\Program Files\nxlog\cert\papertrail-bundle.pem")

# NxLogPaperTrailConfiguration: Maintenance Toolchain - not essential for building firefox
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/nxlog/win7.conf", "C:\Program Files\nxlog\conf\nxlog.conf")

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
$client.DownloadFile("http://7-zip.org/a/7z1602.exe", "C:\binaries\7z1602.exe")
Start-Process "C:\binaries\7z1602.exe" -ArgumentList "/S" -Wait -NoNewWindow

# SublimeText3: Maintenance Toolchain - not essential for building firefox
$client.DownloadFile("https://download.sublimetext.com/Sublime%20Text%20Build%203114%20Setup.exe", "C:\binaries\Sublime Text Build 3114 Setup.exe")
Start-Process "C:\binaries\Sublime Text Build 3114 Setup.exe" -ArgumentList "/VERYSILENT /NORESTART /TASKS=`"contextentry`"" -Wait -NoNewWindow

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

# MozillaBuildSetup: Base Firefox on Windows build requirement
$client.DownloadFile("http://ftp.mozilla.org/pub/mozilla/libraries/win32/MozillaBuildSetup-2.2.0.exe", "C:\binaries\MozillaBuildSetup-2.2.0.exe")
Start-Process "C:\binaries\MozillaBuildSetup-2.2.0.exe" -ArgumentList "/S /D=C:\mozilla-build" -Wait -NoNewWindow

# msys_home: Maintenance Toolchain - not essential for building firefox
cmd /c mklink "C:\mozilla-build\msys\home" "C:\Users"

# reg_PythonInstallPath
New-ItemProperty -Path "HKLM:SOFTWARE\Python\PythonCore\2.7\InstallPath" -Name "(Default)" -Value "C:\mozilla-build\python" -PropertyType String -Force

# reg_PythonPath
New-ItemProperty -Path "HKLM:SOFTWARE\Python\PythonCore\2.7\PythonPath" -Name "(Default)" -Value "C:\mozilla-build\python\Lib;C:\mozilla-build\python\DLLs;C:\mozilla-build\python\Lib\lib-tk" -PropertyType String -Force

# python_3_7_3_win32_core
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/core.msi", "C:\binaries\core.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\core.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_core_d
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/core_d.msi", "C:\binaries\core_d.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\core_d.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_core_pdb
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/core_pdb.msi", "C:\binaries\core_pdb.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\core_pdb.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_dev
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/dev.msi", "C:\binaries\dev.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\dev.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_dev_d
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/dev_d.msi", "C:\binaries\dev_d.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\dev_d.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_doc
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/doc.msi", "C:\binaries\doc.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\doc.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_exe
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/exe.msi", "C:\binaries\exe.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\exe.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_exe_d
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/exe_d.msi", "C:\binaries\exe_d.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\exe_d.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_exe_pdb
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/exe_pdb.msi", "C:\binaries\exe_pdb.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\exe_pdb.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_launcher
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/launcher.msi", "C:\binaries\launcher.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\launcher.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_lib
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/lib.msi", "C:\binaries\lib.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\lib.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_lib_d
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/lib_d.msi", "C:\binaries\lib_d.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\lib_d.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_lib_pdb
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/lib_pdb.msi", "C:\binaries\lib_pdb.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\lib_pdb.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_path
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/path.msi", "C:\binaries\path.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\path.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_pip
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/pip.msi", "C:\binaries\pip.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\pip.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_tcltk
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/tcltk.msi", "C:\binaries\tcltk.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\tcltk.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_tcltk_d
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/tcltk_d.msi", "C:\binaries\tcltk_d.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\tcltk_d.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_tcltk_pdb
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/tcltk_pdb.msi", "C:\binaries\tcltk_pdb.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\tcltk_pdb.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_test
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/test.msi", "C:\binaries\test.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\test.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_test_d
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/test_d.msi", "C:\binaries\test_d.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\test_d.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_test_pdb
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/test_pdb.msi", "C:\binaries\test_pdb.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\test_pdb.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_tools
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/tools.msi", "C:\binaries\tools.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\tools.msi /quiet" -Wait -NoNewWindow

# python_3_7_3_win32_ucrt
$client.DownloadFile("https://www.python.org/ftp/python/3.7.3/win32/ucrt.msi", "C:\binaries\ucrt.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\ucrt.msi /quiet" -Wait -NoNewWindow

# Python3: https://bugzilla.mozilla.org/show_bug.cgi?id=1545339
cmd /c mklink "C:\mozilla-build\python3\python3.exe" "C:\mozilla-build\python3\python.exe"

# DeleteMozillaBuildMercurial
Start-Process "cmd.exe" -ArgumentList "/c del C:\mozilla-build\python\Scripts\hg*" -Wait -NoNewWindow

# Mercurial: https://bugzilla.mozilla.org/show_bug.cgi?id=1490703
$client.DownloadFile("https://www.mercurial-scm.org/release/windows/mercurial-4.7.1-x86.msi", "C:\binaries\mercurial-4.7.1-x86.msi")
Start-Process "msiexec" -ArgumentList "/i C:\binaries\mercurial-4.7.1-x86.msi /quiet" -Wait -NoNewWindow

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
$client.DownloadFile("https://github.com/taskcluster/generic-worker/releases/download/v16.5.1/generic-worker-multiuser-windows-386.exe", "C:\generic-worker\generic-worker.exe")

# LiveLogDownload
$client.DownloadFile("https://github.com/taskcluster/livelog/releases/download/v1.1.0/livelog-windows-386.exe", "C:\generic-worker\livelog.exe")

# TaskClusterProxyDownload
$client.DownloadFile("https://github.com/taskcluster/taskcluster-proxy/releases/download/v5.1.0/taskcluster-proxy-windows-386.exe", "C:\generic-worker\taskcluster-proxy.exe")

# NSSMDownload
$client.DownloadFile("https://nssm.cc/ci/nssm-2.24-103-gdee49fc.zip", "C:\Windows\Temp\NSSMInstall.zip")

# NSSMInstall: NSSM is required to install Generic Worker as a service. Currently ZipInstall fails, so using 7z instead.
Start-Process "C:\Program Files\7-Zip\7z.exe" -ArgumentList "x -oC:\ C:\Windows\Temp\NSSMInstall.zip" -Wait -NoNewWindow

# GenericWorkerInstall
Start-Process "C:\generic-worker\generic-worker.exe" -ArgumentList "install service --nssm C:\nssm-2.24-103-gdee49fc\win32\nssm.exe --config C:\generic-worker\generic-worker.config --configure-for-%MY_CLOUD%" -Wait -NoNewWindow

# DisableDesktopInterrupt
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/GenericWorker/disable-desktop-interrupt.reg", "C:\generic-worker\disable-desktop-interrupt.reg")

# GenericWorkerStateWait
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/GenericWorker/run-generic-worker-and-reboot.bat", "C:\generic-worker\run-generic-worker.bat")

# TaskUserInitScript: https://bugzilla.mozilla.org/show_bug.cgi?id=1433851#c19
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/GenericWorker/task-user-init-win7.cmd", "C:\generic-worker\task-user-init.cmd")

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

# ngen_executeQueuedItems: https://blogs.msdn.microsoft.com/dotnet/2013/08/06/wondering-why-mscorsvw-exe-has-high-cpu-usage-you-can-speed-it-up
Start-Process "c:\Windows\Microsoft.NET\Framework\v4.0.30319\ngen.exe" -ArgumentList "executeQueuedItems" -Wait -NoNewWindow

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
Start-Process "icacls.exe" -ArgumentList "`"C:\Program Files\Mozilla Maintenance Service`" /grant Everyone:(OI)(CI)F" -Wait -NoNewWindow

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

# GrantEveryoneMozillaRegistryWriteAccess: Bug 1353889 - Grant all users account write access to Mozilla registry key
Start-Process "powershell" -ArgumentList "-command `"& {(Get-Acl -Path 'HKLM:\SOFTWARE\Mozilla').SetAccessRule((New-Object -TypeName 'System.Security.AccessControl.RegistryAccessRule' -ArgumentList @('Everyone', 'FullControl', 'Allow')))}`"" -Wait -NoNewWindow

# KmsIn
New-NetFirewallRule -DisplayName "KmsIn (TCP 1688 Inbound): Allow" -Direction Inbound -LocalPort 1688 -Protocol TCP -Action Allow

# KmsOut
New-NetFirewallRule -DisplayName "KmsOut (TCP 1688 Outbound): Allow" -Direction Outbound -LocalPort 1688 -Protocol TCP -Action Allow

# nircmd
$client.DownloadFile("https://s3.amazonaws.com/windows-opencloudconfig-packages/nircmd/nircmd.exe", "C:\Windows\System32\nircmd.exe")

# nircmdc
$client.DownloadFile("https://s3.amazonaws.com/windows-opencloudconfig-packages/nircmd/nircmdc.exe", "C:\Windows\System32\nircmdc.exe")

# reg_Power_PreferredPlan_HighPerformance: https://bugzilla.mozilla.org/show_bug.cgi?id=1362613
New-ItemProperty -Path "HKLM:SOFTWARE\Microsoft\Windows\CurrentVersion\explorer\ControlPanel\NameSpace\{025A5937-A6BE-4686-A844-36FE4BEC8B6D}" -Name "PreferredPlan" -Value "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c" -PropertyType String -Force

# DisableWinDefend: https://bugzilla.mozilla.org/show_bug.cgi?id=1365909
Set-Service "WinDefend" -StartupType Disabled -Status Stopped

# OpenSshDownload: https://bugzilla.mozilla.org/show_bug.cgi?id=1454578
$client.DownloadFile("https://github.com/PowerShell/Win32-OpenSSH/releases/download/v7.6.1.0p1-Beta/OpenSSH-Win32.zip", "C:\Windows\Temp\OpenSSH-Win32.zip")

# OpenSshUnzip: https://bugzilla.mozilla.org/show_bug.cgi?id=1454578
Start-Process "C:\Program Files\7-Zip\7z.exe" -ArgumentList "x -o`"C:\Program Files`" C:\Windows\Temp\OpenSSH-Win32.zip" -Wait -NoNewWindow

# SshIn
New-NetFirewallRule -DisplayName "SshIn (TCP 22 Inbound): Allow" -Direction Inbound -LocalPort 22 -Protocol TCP -Action Allow

# InstallOpenSSH: https://bugzilla.mozilla.org/show_bug.cgi?id=1454578
Start-Process "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File `"C:\Program Files\OpenSSH-Win32\install-sshd.ps1`"" -Wait -NoNewWindow

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

# ProgramData_Mozilla_AccessRights: https://bugzilla.mozilla.org/show_bug.cgi?id=1494048
Start-Process "icacls.exe" -ArgumentList "c:\ProgramData\Mozilla /grant Everyone:(OI)(CI)F" -Wait -NoNewWindow

# HostsFile: https://bugzilla.mozilla.org/show_bug.cgi?id=1497308
$client.DownloadFile("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Configuration/etc/hosts", "C:\Windows\System32\drivers\etc\hosts")

# SetHostsFileContent: https://bugzilla.mozilla.org/show_bug.cgi?id=1497308

# env_TASKCLUSTER_ROOT_URL: https://bugzilla.mozilla.org/show_bug.cgi?id=1551789
[Environment]::SetEnvironmentVariable("TASKCLUSTER_ROOT_URL", "https://firefox-ci-tc.services.mozilla.com", "Machine")

# programdata_google_auth: https://bugzilla.mozilla.org/show_bug.cgi?id=1588757
md "C:\ProgramData\Google\Auth"

# stackdriver_key: https://bugzilla.mozilla.org/show_bug.cgi?id=1588757
cmd /c mklink "C:\ProgramData\Google\Auth\application_default_credentials.json" "C:\builds\taskcluster-worker-ec2@aws-stackdriver-log-1571127027.json"

# now shutdown, in preparation for creating an image
# Stop-Computer isn't working, also not when specifying -AsJob, so reverting to using `shutdown` command instead
#   * https://www.reddit.com/r/PowerShell/comments/65250s/windows_10_creators_update_stopcomputer_not/dgfofug/?st=j1o3oa29&sh=e0c29c6d
#   * https://support.microsoft.com/en-in/help/4014551/description-of-the-security-and-quality-rollup-for-the-net-framework-4
#   * https://support.microsoft.com/en-us/help/4020459
shutdown -s
