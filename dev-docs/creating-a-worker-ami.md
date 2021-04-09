# Creating a worker AMI for your Taskcluster deployment

Once you have your Taskcluster deployment up and running, you might want to look at getting workers setup.
This guide will walk you through how to use [monopacker](https://github.com/taskcluster/monopacker) to automatically build an AWS AMI for your workers.

## Prerequisites

You will need to have the following

* An AWS account with an IAM user with an API key.
* Some funds on your AWS account, or backed by a creditcard: building, using and even storing the AMIs you something you will get billed for.

### Cloning the repository and installing

First you will want to clone the [monopacker](https://github.com/taskcluster/monopacker) repository.
Set up a folder and run `git clone https://github.com/taskcluster/monopacker` and then `cd` into the directory.

Make sure you have python3 and python3-venv installed. Then run `python3 -m venv dev` to make a python virtual environment in the dev directory. Run `source ./dev/bin/activate` to activate it.

To install everything we need, from within the venv, run `python setup.py install`.

### Configuring the template

First we edit `template/builders/amazon_ebs.jinja2` and under `ami_users` set your AWS account ID.

Create a new file called `template/vars/tc-doc-aws.yaml` with the following contents, and be sure to edit them accordingly (see comments):

```yaml
---
instance_type: c5.large # Change this to the instance type you want to use to build the worker.
region: us-east-1 # Change this to the region where you want the AMI to be build.
ami_regions: us-east-1 # Change this to the region where you want your AMI to be copied to (and where you can later deploy the workers to).
volume_size: 20 # Change this to the size of the volume that you want your workers to have.
```

Once that has been done, we can build our own template.

Create a YAML file for your template, for example `builders/tc-doc-aws.yaml` and use the following contents (edit the comment):

```yaml
template: amazon_ebs
platform: linux

builder_var_files:
  - taskcluster_version
  - default_linux
  - default_aws
  - default_firefoxci
  - amazon_ebs_bionic
  - tc-doc-aws # Put the name of the variable file you created here

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

### Worker pool secret configuration

In a secret you can specify options for your worker pool that you do not want to be publically viewable.
The name of the worker pool secret should be `worker-pool:worker_pool_id`. For example: `worker-pool:aws-docker/tc-doc-medium`.

Example value if you want to configure live log viewing, note that you will need to set up a specific DNS server with the same secret (currently no extra documentation on this), which you can find [here](https://github.com/taskcluster/stateless-dns-server)

```yaml
config:
  statelessHostname:
    secret: long-secure-secret # Change this to a long and secure secret
    domain: taskcluster-worker.example.com # Change this to a domain where workers will be accessable from.
```

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
