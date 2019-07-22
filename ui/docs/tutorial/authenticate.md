---
title: Authenticating to Taskcluster
layout:             default
class:              markdown
followup:
  links:
    create-task-via-api: Create a task with createTask
---

# Authenticating to Taskcluster

Taskcluster uses its own kind of "credentials" to [authenticate API
requests](/docs/manual/design/apis). These credentials can come from a variety of
sources, but in this section we will create a client manually, using the Tools
site.

If you haven't already, try the "[Hello World](hello-world)" tutorial to make
sure that you can sign in to the tools site.

Open the Clients tool (under Authorization) and create a new client:

 * Add `tutorial` to the end of the clientId
 * Set the expiration date to tomorrow, and check "Automatically delete this client when it expires"
 * Add the scope `queue:create-task:aws-provisioner-v1/tutorial`.

When you create the client, the site will give you an accessToken.  Copy that
and set it in your shell session, along with the clientId you chose.  Sometihng
like this:

```
export TASKCLUSTER_CLIENT_ID=email/you@yourdomain.com/tutorial
export TASKCLUSTER_ACCESS_TOKEN=9dTvVYdzMxAb6qnMPccfQhSzfrMZ1WQ46DgsL_I75S-w
```

## Alternative Process

The [taskcluster-cli](https://github.com/taskcluster/taskcluster-cli) project
provides a tool that can do all of the above for you.

```
$ eval `taskcluster signin --scope queue:create-task:aws-provisioner-v1/tutorial`
Starting
Listening for a callback on: http://localhost:37885
Opening URL: https://tc.example.com/auth/clients/new?name=cli&description=Temporary+client+for+use+on+the+command+line&scope=*&expires=1d&callback_url=http%3A%2F%2Flocalhost%3A37885
Credentials output as environment variables
```

You can test the results with the same tool:

```
$ ./taskcluster api auth currentScopes
{
    "scopes": [
        "queue:create-task:aws-provisioner-v1/tutorial"
    ]
}
```
