User Data
=========

In order to set up a new AWS Provisioner Worker Type running on Windows, follow these steps:

1. Launch a Windows instance in AWS with the following UserData:

   ```powershell
   <powershell>
   
   $client = New-Object system.net.WebClient
   
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
   $client.DownloadFile("https://github.com/taskcluster/generic-worker/releases/download/v1.0.11/generic-worker-windows-amd64.exe", "C:\generic-worker\generic-worker.exe")
   
   # enable DEBUG logs for generic-worker install
   $env:DEBUG = "*"
   
   # install generic-worker
   $p = Start-Process C:\generic-worker\generic-worker.exe -ArgumentList "install --config C:\\generic-worker\\generic-worker.config" -wait -NoNewWindow -PassThru -RedirectStandardOutput C:\generic-worker\install.log -RedirectStandardError C:\generic-worker\install.err
   $p.HasExited
   </powershell>
   ```
2. Connect to the instance
3. Install any additional toolchains required for your tasks
4. Snapshot the instance, creating an AMI
5. Create a Worker Type in the AWS Provisioner, referencing the AMI you created

See https://www.youtube.com/watch?t=800&v=B1MAyJpUya8 for a complete walkthrough.

Windows Firefox Builds
======================

Here is the powershell script that can be supplied as UserData when launching
an AWS instance, to install the generic worker plus the toolchains required for
building Firefox.

```powershell
<powershell>

# needed for making http requests
$client = New-Object system.net.WebClient

# utility function to download a zip file and extract it
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

# allow powershell scripts to run
Set-ExecutionPolicy Unrestricted -Force -Scope Process

# install chocolatey package manager
Invoke-Expression ($client.DownloadString('https://chocolatey.org/install.ps1'))

# download mozilla-build installer
$client.DownloadFile("https://api.pub.build.mozilla.org/tooltool/sha512/03b4ca2bebede21a29f739165030bfc7058a461ffe38113452e976193e382d3ba6df8a48ac843b70429e23481e6327f43c86ffd88e4ce16263d072ef7e14e692", "C:\MozillaBuildSetup-2.0.0.exe")

# run mozilla-build installer in silent (/S) mode
$p = Start-Process "C:\MozillaBuildSetup-2.0.0.exe" -ArgumentList "/S" -wait -NoNewWindow -PassThru -RedirectStandardOutput "C:\MozillaBuild-2.0.0_install.log" -RedirectStandardError "C:\MozillaBuild-2.0.0_install.err"

# wait for install to finish
$p.HasExited

# install Windows SDK 8.1
choco install -y windows-sdk-8.1

# install Visual Studio community edition 2013
choco install -y visualstudiocommunity2013
# $client.DownloadFile("https://go.microsoft.com/fwlink/?LinkId=532495&clcid=0x409", "C:\vs_community.exe")

# install PSTools
md "C:\PSTools"
Expand-ZIPFile -File "C:\PSTools\PSTools.zip" -Destination "C:\PSTools" -Url "https://download.sysinternals.com/files/PSTools.zip"

# install nssm
Expand-ZIPFile -File "C:\nssm-2.24.zip" -Destination "C:\" -Url "http://www.nssm.cc/release/nssm-2.24.zip"

# download generic-worker
md C:\generic-worker
$client.DownloadFile("https://github.com/taskcluster/generic-worker/releases/download/v1.0.11/generic-worker-windows-amd64.exe", "C:\generic-worker\generic-worker.exe")

# enable DEBUG logs for generic-worker install
$env:DEBUG = "*"

# install generic-worker
$p = Start-Process C:\generic-worker\generic-worker.exe -ArgumentList "install --config C:\\generic-worker\\generic-worker.config" -wait -NoNewWindow -PassThru -RedirectStandardOutput C:\generic-worker\install.log -RedirectStandardError C:\generic-worker\install.err
$p.HasExited
</powershell>

```

Script to create AMI
====================

This section is work-in-progress...

```bash
SLUGID=$(~/venvs/xxx/bin/python -c 'import slugid; print slugid.nice()')
B64_ENCODED_USER_DATA=$(base64 firefox.userdata)
aws --region us-west-2 ec2 run-instances --image-id ami-4dbcb67d --key-name pmoore-oregan-us-west-2 --security-groups "RDP only" --user-data $B64_ENCODED_USER_DATA --instance-type c4.2xlarge --block-device-mappings DeviceName=/dev/sda1,Ebs='{VolumeSize=75,DeleteOnTermination=true,VolumeType=gp2}' --instance-initiated-shutdown-behavior terminate --client-token $SLUGID
sleep 3600
aws --region us-west-2 ec2 create-image --instance-id i-00ed82c6 --name "win2012r2 mozillabuild pmoore" --description "firefox desktop builds on windows - taskcluster worker"
```

Output
------

```
pmoore@Petes-iMac:~ $ aws ec2 run-instances --image-id ami-4dbcb67d --key-name pmoore-oregan-us-west-2 --security-groups "RDP only" --user-data $B64_ENCODED_USER_DATA --instance-type c4.2xlarge --block-device-mappings DeviceName=/dev/sda1,Ebs='{VolumeSize=75,DeleteOnTermination=true,VolumeType=gp2}' --instance-initiated-shutdown-behavior terminate --client-token $SLUGID
{
    "OwnerId": "692406183521", 
    "ReservationId": "r-38791fce", 
    "Groups": [], 
    "Instances": [
        {
            "Monitoring": {
                "State": "disabled"
            }, 
            "PublicDnsName": "", 
            "Platform": "windows", 
            "State": {
                "Code": 0, 
                "Name": "pending"
            }, 
            "EbsOptimized": false, 
            "LaunchTime": "2015-09-11T18:42:57.000Z", 
            "PrivateIpAddress": "172.31.26.113", 
            "ProductCodes": [], 
            "VpcId": "vpc-24233046", 
            "StateTransitionReason": "", 
            "InstanceId": "i-00ed82c6", 
            "ImageId": "ami-4dbcb67d", 
            "PrivateDnsName": "ip-172-31-26-113.us-west-2.compute.internal", 
            "KeyName": "pmoore-oregan-us-west-2", 
            "SecurityGroups": [
                {
                    "GroupName": "RDP only", 
                    "GroupId": "sg-f1db5a95"
                }
            ], 
            "ClientToken": "IZVUbW-gTrevGOk5PyP1kQ", 
            "SubnetId": "subnet-26f2c052", 
            "InstanceType": "c4.2xlarge", 
            "NetworkInterfaces": [
                {
                    "Status": "in-use", 
                    "MacAddress": "06:40:fd:49:9f:a9", 
                    "SourceDestCheck": true, 
                    "VpcId": "vpc-24233046", 
                    "Description": "", 
                    "NetworkInterfaceId": "eni-843937cd", 
                    "PrivateIpAddresses": [
                        {
                            "PrivateDnsName": "ip-172-31-26-113.us-west-2.compute.internal", 
                            "Primary": true, 
                            "PrivateIpAddress": "172.31.26.113"
                        }
                    ], 
                    "PrivateDnsName": "ip-172-31-26-113.us-west-2.compute.internal", 
                    "Attachment": {
                        "Status": "attaching", 
                        "DeviceIndex": 0, 
                        "DeleteOnTermination": true, 
                        "AttachmentId": "eni-attach-c7928ce6", 
                        "AttachTime": "2015-09-11T18:42:57.000Z"
                    }, 
                    "Groups": [
                        {
                            "GroupName": "RDP only", 
                            "GroupId": "sg-f1db5a95"
                        }
                    ], 
                    "SubnetId": "subnet-26f2c052", 
                    "OwnerId": "692406183521", 
                    "PrivateIpAddress": "172.31.26.113"
                }
            ], 
            "SourceDestCheck": true, 
            "Placement": {
                "Tenancy": "default", 
                "GroupName": "", 
                "AvailabilityZone": "us-west-2b"
            }, 
            "Hypervisor": "xen", 
            "BlockDeviceMappings": [], 
            "Architecture": "x86_64", 
            "StateReason": {
                "Message": "pending", 
                "Code": "pending"
            }, 
            "RootDeviceName": "/dev/sda1", 
            "VirtualizationType": "hvm", 
            "RootDeviceType": "ebs", 
            "AmiLaunchIndex": 0
        }
    ]
}
```

```
pmoore@Petes-iMac:~/go/src/github.com/taskcluster/generic-worker master $ aws --region us-west-2 ec2 create-image --instance-id i-00ed82c6 --name "win2012r2 mozillabuild pmoore" --description "firefox desktop builds on windows - taskcluster worker"
{
    "ImageId": "ami-fb1d01cb"
}
```
