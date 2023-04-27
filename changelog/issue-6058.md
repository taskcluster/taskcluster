audience: users
level: patch
reference: issue 6058
---
Generic Worker no longer modifies the Access Control Lists of the Interactive Desktop and the associated Windows Station unless additional OS groups have been specified in the task payload `osGroups` property. Previously Generic Worker would modify the ACLs of these objects even if the access token it was using for launching task command processes already had suitable permissions. This patch is a workaround for a more general issue, which is that the ACL modifications seem not to be appropriate in all cases when a new access token is needed. See https://bugzilla.mozilla.org/show_bug.cgi?id=1815711.

There is a likely to be a follow up fix for the ACL modifications that occur when a new access token is required, once it is understood why the current modifications are not always sufficient.
