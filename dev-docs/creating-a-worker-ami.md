# Creating a worker AMI for your Taskcluster deployment

Once you have your Taskcluster deployment up and running, you might want to look at getting workers setup.
This guide will walk you through how to use [monopacker](https://github.com/taskcluster/monopacker) to automatically build an AWS AMI for your workers.

## Prerequisites

You will need to have the following

* An AWS account with an IAM user with an API key.
* Some funds on your AWS account, or backed by a creditcard: building, using and even storing the AMIs you something you will get billed for.

### Cloning the repository and isntalling.

First you will want to clone the [monopacker](https://github.com/taskcluster/monopacker) repository.
Set up a folder and run `git clone https://github.com/taskcluster/monopacker` and then `cd` into the directory.

Make sure you have python3 and python3-venv installed. Then run `python3 -m venv dev` to make a python virtual environment in the dev directory. Run `source ./dev/bin/activate` to activate it.

To install everything we need, from within the venv, run `python setup.py install`.

### Configuring the template

First we edit `template/builders/amazon_ebs.jinja2` and under `ami_users` set your AWS account ID.

Then we edit `template/vars/default_aws.yaml` and we change the following:

* Change `instance_type` to an instance type that has the amount of capacity that you will need. For example `c5.large`.
  Note that this size is only for the instance used to _build_ the image.
  You can run the image on any sized instance.
* Change `region:` to the region that you want to build the AMI in.
* Change `ami_regions:` to regions where you wish to copy the AMI to and use it to deploy workers.
* Change `volume_size:` to the volume size that you want your boot volume to be, in GB.

Once that has been done, we can build our own template.

Create a YAML file for your template, for example `builders/tc-doc-aws.yaml` and use the following contents:

```yaml
template: amazon_ebs
platform: linux

builder_var_files:
  - taskcluster_version
  - default_linux
  - default_aws
  - default_firefoxci
  - amazon_ebs_bionic

script_directories:
  - ubuntu-bionic
  - worker-runner-linux
  - docker-worker-linux
```

### Verifying the files

To verify the files, run `monopacker validate tc-doc-aws`. This will give any errors if something is not valid in your configuration.

### Building the AMI

In order to build the AMI, have your AWS Access ID and your AWS Secret Access Key ready, we are going to need to put these on the command line.
You can run `AWS_ACCESS_KEY_ID='accesskey' AWS_SECRET_ACCESS_KEY='secretkey' monopacker build tc-doc-aws` to build the AMI.
If you want extra logging, you can put `PACKER_LOG=1` in front of the command, making it `PACKER_LOG=1 AWS_ACCESS_KEY_ID='accesskey' AWS_SECRET_ACCESS_KEY='secretkey' monopacker build tc-doc-aws`.

This will create and output the new AMI ID(s) that you can use for your worker pool.

### Setting up the AWS provider in Taskcluster

We will need to provide AWS credentials that Taskcluster can use to deploy EC2 instances.
To do this, you will need an AWS Access ID and AWS Secret Access key.

Edit your `dev-config.yaml` file, and under `worker_manager:`, place:

```yaml
providers: {
    "provider-name": {
      "providerType": "aws",
      "credentials": {
        "accessKeyId": "accesskey",
        "secretAccessKey": "secretkey"
      }
    }
  }
```

For more information, you can check out [this page](https://docs.taskcluster.net/docs/manual/deploying/workers#aws).

### Example worker pool configuration

Now that we have the AMi created, we want to use it for a worker pool.
Here is an example configuration that you can use, see the edits you will have to do in the comments.
Be sure to select the AWS provider that we created earlier.

```yaml
{
  "lifecycle": {
    "registrationTimeout": 1800,
    "reregistrationTimeout": 345600
  },
  "maxCapacity": 5, # The maximum amount of capacity this pool may have.
  "minCapacity": 0, # The minimum amount of capacity this pool will have.
  "launchConfigs": [
    {
      "region": "us-east-1", # Change this with the region that you build the AMI in.
      "launchConfig": {
        "ImageId": "ami-0c4c069fa87ffd315", # Change this with the AMI ID for the availbility zone that you build it in.
        "KeyName": "", # You can leave this empty, however in here you can specify a SSH key you have on your AWS account to be able to SSH into the worker for troubleshooting.
        "SubnetId": "subnet-00eb3c6f45f945c02", # The subnet ID for the subnet in the region you want the instances to connect to.
        "Placement": {
          "AvailabilityZone": "us-east-1c" # Set the availbility zone where the AMI is in.
        },
        "InstanceType": "c5.large", # Here you can specify what instance gets created for the workers.
        "SecurityGroupIds": [
          "sg-0b86e71d4641a91ae" # Set the security group ID of the security group you want your workers to have.
                                 # Note that security groups are specific to a subnet.
        ],
        "InstanceMarketOptions": {
          "MarketType": "spot"
        }
      },
      "workerConfig": {
        "capacity": 1,
        "shutdown": {
          "enabled": true,
          "afterIdleSeconds": 30 # Shut down worker after being idle for x seconds.
        },
        "deviceManagement": {
          "loopbackAudio": {
            "enabled": false
          },
          "loopbackVideo": {
            "enabled": false
          }
        },
        "capacityManagement": {
          "diskspaceThreshold": 1000000000 # Threshold in bytes, if this gets exceeded, the worker will no longer accept jobs.
        }
      },
      "additionalUserData": {},
      "capacityPerInstance": 2 # How much job capacity one EC2 instance can provide.
    }
  ]
}
```
