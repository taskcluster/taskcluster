level: major
---
The Taskcluster Go client no longer uses the deprecated concept of BaseURL, instead requiring a RootURL.  Users of the `New` and `NewFromEnv` functions do not need to change anything.  However, any code that has manually constructed a client object, or set such an object's `BaseURL` property, must be updated to use `RootURL` instead.
