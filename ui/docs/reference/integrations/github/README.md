# Github Service

This service monitors all of the repositories associated with an organization for changes and schedules Taskcluster tasks for any repository which contains a `.taskcluster.yml` configuration file.
The goal of this project is to provide project owners a method for scheduling jobs in Taskcluster which is quick and straight forward.

**NOTE: This project used to provide a base docker image for convenience's sake, but it has been deprecated due to not being that useful and not being kept up-to-date. The image will continue existing, but we recommend migrating to another image.**

### Adding status badges to your project's README:

Insert the following string (replacing the words in caps with your organization or user name, repository name and the branch name) to the readme file in your project's repository:
`[![Task Status](https://github.taskcluster.net/v1/repository/USERNAME/REPONAME/BRANCHNAME/badge.svg)](https://github.taskcluster.net/v1/repository/USERNAME/REPONAME/BRANCHNAME/latest)`
