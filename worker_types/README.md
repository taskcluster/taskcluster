Setting up a new Windows worker type
====================================

1. Create a subdirectory here, named the same as the worker type.
2. Inside the directory create a file called `userdata` which contains the userdata for setting up the environment.
3. Optional: place any other files related to the worker type in this directory, for example you may wish to copy the worker type definition into a file here, or include other information such as an example task.
4. Create the worker type on the AWS provisioner, making sure to include an (arbitrary existing) AMI for all the provisioner supported regions (currently us-east-1, us-west-1, us-west-2)
5. Run [`./worker_type.sh`](https://github.com/taskcluster/generic-worker/blob/master/worker_types/worker_type.sh)` <worker_type> update`
6. Create a task in the Task Creator to check whether everything is working ok.

Updating an existing worker type with a new generic worker and/or new userdata
==============================================================================

1. Make sure there is a frozen release of the generic worker to use (to make a release, follow release instructions in [README.md](https://github.com/taskcluster/generic-worker/blob/master/README.md)).
2. Update the userdata for the workertype to use the new release number, if changed.
3. Update the userdata with any other setup changes, if required.
4. Run [`./worker_type.sh`](https://github.com/taskcluster/generic-worker/blob/master/worker_types/worker_type.sh)` <worker_type> update`
5. Create a task in the Task Creator to check whether everything is working ok.

Video Guide to setting up windows worker types
==============================================

This is a bit old-school - but to see the process performed manually, see
https://www.youtube.com/watch?t=800&v=B1MAyJpUya8 for a walkthrough. These days
things are a bit simpler, as you just need to update the userdata file and run
the create.sh script, as documented above - but the video will give you an
insight into what takes place.
