audience: users
level: patch
---

Introduced `github.renderTaskclusterYml` endpoint to render provided `.taskcluster.yml` file for various events.
This might be used for debug purposes or to validate the taskcluster.yml file
and make sure that resulting tasks and scopes produce expected values.
