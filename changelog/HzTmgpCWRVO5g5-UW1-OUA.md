audience: users
level: patch
---

Introduced `github.renderTasklcusterYaml` endpoint to render provided taskcluster.yaml file for various events.
This might be used for debug purposes or to validate the taskcluster.yaml file
and make sure that resulting tasks and scopes produce expected values.
