level: minor
reference: issue 1529
---
When a third party site tries to login to the deployment, Taskcluster now attempts to auto login when there is only one login strategy configured. Previously, a user had to click on "Sign In" then click on the login strategy.
