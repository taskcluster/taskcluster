# So you want to deploy a docker worker?

1. Do you need to update docker/node/apt package versions?

  a. No: Okay go to 2.
  b. Yes: Go to [Creating a base image](#creating-a-base-image) then go to 2.


2. Did you update the base image or need to deploy new code
   changes/config changes from [templates](/deploy/templates)?

  a. No: Okay go to 3
  b. Yes: Go to [Creating a app image](#creating-a-app-image)


3. JSON schema changes?

  a. Yes: run `./bin/upload-schema.js`
  b. No continue to 4.


4. _Test_ changes by manually launching an AMI or via a new/beta worker
   type

5. Switch over your desired worker type to the new AMI in the [aws
   provisioner](http://aws-provisioner.taskcluster.net/)


## Creating a app image

  - Update any of the `deploy/packer/`, `deploy/template` files.
  - Run `./deploy/bin/build app`

## Creating a base image:

  - Update any of the `deploy/packer/base.json`, `deploy/packer/base/scripts/*`
    files.

  - Run `./deploy/bin/build base`.

  - Take the AMI id from that (assuming it works correctly) and update
    [app.json](/deploy/packer/app.json) `sourceAMI` value to the new
    AMI.
