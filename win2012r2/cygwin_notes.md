This isn't quite working yet, but kinda close. Works when run manually, but not as UserData...

```powershell
$client = New-Object system.net.WebClient

# download cygwin
$client.DownloadFile("https://www.cygwin.com/setup-x86_64.exe", "C:\cygwin-setup-x86_64.exe")

# install cygwin
# complete package list: https://cygwin.com/packages/package_list.html
$p = Start-Process "C:\cygwin-setup-x86_64.exe" -ArgumentList "--quiet-mode --wait --root C:\cygwin --site http://cygwin.mirror.constant.com --packages openssh,vim,curl,tar,wget,zip,unzip,diffutils" -wait -NoNewWindow -PassThru -RedirectStandardOutput "C:\cygwin_install.log" -RedirectStandardError "C:\cygwin_install.err"

# open up firewall for ssh daemon
New-NetFirewallRule -DisplayName "Allow SSH inbound" -Direction Inbound -LocalPort 22 -Protocol TCP -Action Allow

# configure sshd
$p = Start-Process "C:\cygwin\bin\bash.exe" -ArgumentList "--login -c `"ssh-host-config -y -c 'ntsec mintty' -u 'cygwinsshd' -w 'qwe123QWE!@#'`"" -wait -NoNewWindow -PassThru -RedirectStandardOutput "C:\cygrunsrv.log" -RedirectStandardError "C:\cygrunsrv.err"

# start sshd
$p = Start-Process "net" -ArgumentList "start sshd" -wait -NoNewWindow -PassThru -RedirectStandardOutput "C:\net_start_sshd.log" -RedirectStandardError "C:\net_start_sshd.err"

# download bash setup script
$client.DownloadFile("https://raw.githubusercontent.com/petemoore/myscrapbook/master/setup.sh", "C:\cygwin\home\Administrator\setup.sh")

# run bash setup script
$p = Start-Process "C:\cygwin\bin\bash.exe" -ArgumentList "--login -c 'chmod a+x setup.sh; ./setup.sh'" -wait -NoNewWindow -PassThru -RedirectStandardOutput "C:\Administrator_cygwin_setup.log" -RedirectStandardError "C:\Administrator_cygwin_setup.err"
```
