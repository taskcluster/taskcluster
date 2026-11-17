audience: users
level: patch
---
The hook trigger context form doesn't consider YAML as invalid anymore. It always accepted both JSON and YAML but was throwing linting errors on YAML inputs
