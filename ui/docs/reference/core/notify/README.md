# Notify Service

No longer will you need to keep going back to the task-inspector page to know if your task is complete!
Merely add some routes and we will tell you when your task is done!
Note: You'll need to have the appropriate scopes to add these routes.

Example routes:

```
"routes": [
  "notify.email.<you@you.com>.on-any",
  "notify.irc-user.<your-mozilla-irc-nick>.on-failed",
  "notify.irc-channel.<a-mozilla-irc-channel>.on-completed",
  "notify.pulse.<a-pulse-routing-key>.on-exception"
]
```
**Note**: However all notifications are transmitted via pulse and should not be considered private.
Further specification of this is contained in the [usage docs](/docs/reference/core/notify/usage). **Note: The channel should have the # preceeding it.**
