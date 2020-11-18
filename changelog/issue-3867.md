audience: general
level: patch
reference: issue 3867
---
Taskcluster-Github should now function correctly in a deployment with no scopes in the `anonymous` role.

If you have a locked-down deployment without allowing public artifacts fetching in your `anonymous` role, you must add
`queue:get-artifact:public/github/customCheckRunText.md` and `queue:get-artifact:public/github/customCheckRunAnnotations.json`
to the scopes of your task to avoid an error comment being added to your
commits. Note that this will change if you choose a custom artifact name (see custom artifact docs for more)