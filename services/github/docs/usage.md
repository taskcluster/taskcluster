---
title: Using Taskcluster for Github Projects
description: How to add Taskcluster to Github Organizations
---

# Using Taskcluster for Github Projects

Taskcluster is easy to set up for simple CI cases and very expressive
and powerful for more complex cases. It should fit just about any
use case you can think of for CI on a Github project. It is used for
projects as simple to test as calling `npm test` all the way up to
the very complex set of tasks to perform in order to test and build
the Firefox browser.

There is a certain amount of setup involved at this time in order to
get your project building with Taskcluster.

## Setting up Taskcluster with a Github Organization

You'll need to be an admin of an organization in order to perform
the following steps. You'll also need to get in touch with the
Taskcluster team. The easiest way will be on the `#taskcluster`
channel of the [Mozilla IRC server](https://wiki.mozilla.org/IRC).

1. Invite [TaskclusterRobot](https://github.com/taskclusterrobot) to your org
as a member. Adding as an owner is not recommended. The Taskcluster team
will need to accept the invitation on behalf of the robot.
2. (Optional) Create a team for robots and add TaskclusterRobot to it.
3. Create a webhook for the organization from the settings page. It should
point at https://github.taskcluster.net/v1/github, have a content type
of `application/json` and have a secret which you can get from the
Taskcluster team if you contact us. The hook should send at least the
Pull Request and Push events.

## Setting up Taskcluster with a Github Team or Project

You'll need to be an admin of the team or project to be able to perform
the following steps.

1. If the TaskclusterRobot is not already a member of the organization this
project is a part of, follow the steps above to add it.
2. Add the TaskclusterRobot or team containing the robot to a project as
collaborators with write permissions. The write permission is used to check
for the permissions of other users in the repository.
3. (Optional) Push a test branch to the repository. You should see activity
from Taskcluster in your email. If you create a Pull Request, the status
should get updated by Taskcluster.
