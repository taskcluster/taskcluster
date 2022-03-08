# Upgrading Taskcluster

Upgrading Taskcluster is relatively easy to do.

## Step 1: Pulling the changes

First the new version should be pulled using `git pull`. This can be from the `main` branch, or from a tag that's specific to the release which is a better practice in general.

## Step 2: Identifying what needs to be upgraded

Taskcluster itself should be upgraded. However, you should investigate if workers, such as docker-worker should also be upgraded (in case of breaking changes, this should be listed in the release notes).  
For this and other reasons it is important to not fall behind on updates too far unless you are willing to read a bunch of release notes to make sure that there are, or are no breaking changes that require worker upgrades.

## Step 3: Updating workers

As listed above, it is best to also update the workers. This can be done by downloading (or building) the docker-worker tarball and/or the generic-worker tarball, replacing the existing installation and restarting the service.

## Step 4: Upgrading Taskcluster itself

Once all changes are pulled, in `dev-config.yml` you should update the docker image that it used for the pods. This can be an upstream one, or one that you build yourself using `yarn build` and push to an image repository.  
With the image edited, the next step is to run `yarn dev:apply` to update all Kubernetes pods. If this succeeds you can move on to the next step.

## Step 5: Database schema upgrade

Taskcluster should always be backwards-compatible with older database schemas, but you may miss out on new features. You may execute `yarn dev:db:upgrade` or look at [these docs](https://docs.taskcluster.net/docs/manual/deploying/database#upgrades) for more information, this will depend on your set up.  
This should be everything and the upgrade should be done at this point.

## Extra information

It is advised when using Taskcluster in an active production envirounment to have a secondary cluster, like a staging cluster to test out upgrades first.
