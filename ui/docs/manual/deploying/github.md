---
title: GitHub Integration
---

The GitHub service requires a GitHub App in order to interact with GitHub.

## Why are there 2 apps? 

This App is not to be confused with the OAuth App used for the [GitHub login strategy](./login-strategies).
GitHub does not help this confusion by using the phrases "GitHub App" and "OAuth App"!

Taskcluster uses this App to get notified of changes on GitHub and update GitHub with the results of tasks.
The other OAuth App pertains to GitHub logins and is only needed on Taskcluster instances that use this feature.

A weakness in GitHub's authorization model is responsible for the need for two apps.
If you use a GitHub App such as this one to sign in, the token it recieves can do anything as the user who just signed in.
That's why Taskcluster keeps this feature as isolated from everything else as possible. 

### What should the apps be named? 

The apps can have the same name, but that's confusing. Call them `deploymentname-taskcluster` and `deploymentname-taskcluster-signin`. 

### How to create the Taskcluster Github app? 

Use the docs at https://developer.github.com/apps/building-github-apps/creating-a-github-app/.
If you want it to be owned by an org, you probalby need to be an admin of that org.
Create it under "Settings" (for yourself or for an org) -> "Developer Settings" -> "GitHub Apps" -> "New GitHub App".

Set the fields as follows: 

* Homepage URL should link to your deployment's root URL
* Setup URL should link to your taskcluster instance's quickstart guide, `/quickstart` on your deployment's root URL
* Webhook URL should link to `/api/github/v1/github` on your deployment's root URL
* Set the secret to an arbitrary value that you also configure in your Taskcluster instance's settings. 

### How to set up private keys? 

On the app's settings page, generate a private key, and add its PEM to your Taskcluster instance's configs. Then restart your Taskcluster instance's GitHub service. 

### What permissions does the Taskcluster Github app need?

As of June 2019, the permissions list is: 

* repo administration: read-only
* checks: read & write
* repo contents: read-only
* content references, deployments: No access
* issues: read & write
* repo metadata: read-only
* pages: no access
* pull requests: read & write
* repo webhooks, projects, security alerts, & single file: no access
* commit statuses: read & write
* organization members: read only
* blocking org users, org projects, team discussions, org administration, org hooks, org plan: No access

* User permissions: No access for any

* Subscribe to events: Pull request, Push, Release



