# MPNS: Changelog

This document has been superceded by the built-in GitHub releases feature. Find out more about release notes and changes at https://github.com/jeffwilcox/mpns/releases

## 2.x

2.0.1:

* Contains a compatibility fix (thanks @yavorg) allowing for an older broken property case name, `smallbackgroundImage` to be translated to `smallBackgroundImage`.

2.0.0:

* createTile, createFlipTile, createToast, createRaw functions separate from send functions.
* BREAKING CHANGE: Removes the very old liveTile, toast, rawNotification class types exposed by the module. To use this functionality for legacy apps, simply use any npm version prior to 2.0.0. The latest known version before the change was 1.2.8.
* Increments the npm version to 2.0.0 to signal breaking change. Note that there is no major new functionality other than breaking change and an incrementally better implementation, unit tests, etc.

## 1.x

1.2.8:

* Adds a fix for Node 0.10.10+ to properly consume response data via stream resume

1.2.7:

* Mild refactoring

1.2.6:

* Adds support for an HTTP proxy via `options.proxy` (thanks @tjunnone)

1.2.5:

* Adds support for TLS/HTTPS authenticated push channels

1.2.4:

* Fixes a small typo in smallBackgroundImage (thanks @rs)
* Adds error handling when URLs cannot be resolved

1.2.3:

* Uses `url.parse` to support hostnames with ports 

1.2.2:

* Allows clearing a property value for tiles

1.2.1:

* Renames `sendRawNotification` to `sendRaw`
* Renames `error` parameter to `innerError`
* Fixes issue #8 that `sendRaw` wasn't working

1.2.0:

* Adds support for `sendFlipTile` method to support the new kinds of tiles added in 7.8+ devices
* Adds support for secondary tiles via the `id` parameter

1.1.1:

* Adds parameter validation that will throw, for robustness.

1.1.0:

* Adds `sendText` and `sendTile` methods more consistent with the WNS module, removing the need to create a new object, only to then call send on it with a push URI.

1.0.4:

* Adds support for Node.js through 0.9.0

1.0.3:

* Addresses issues when using numbers to set the tile data
* Cleans up string encoding functions.

1.0.2:

* Fixes some small formatting issues.

1.0.1:

* Adds raw notification type support.

1.0.0:

* Initial implementation offering basic live tile and toast (no raw) support.
