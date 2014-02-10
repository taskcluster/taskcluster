#mpns

[![build status](https://secure.travis-ci.org/jeffwilcox/mpns.png)](http://travis-ci.org/jeffwilcox/mpns)

Send toast and live tile updates to Windows Phones through the Microsoft Push Notification Service (MPNS). Intended for cloud applications powered by Node.js.

## Installation

Via [npm][]:

	$ npm install mpns
	
As a submodule of your Git project

	$ git submodule add http://github.com/jeffwilcox/mpns.git mpns
	$ git submodule update --init

## Usage
### Load in the module

```javascript
var mpns = require('mpns');
```

### Sending a toast
To send a toast, simply call the `sendToast` method on mpns.

```javascript
var mpns = require('mpns');
mpns.sendToast(pushUri, 'Bold Text', 'This is normal text');

// Optional callback
mpns.sendToast(pushUri, text1, text2, callback);
```

Each of the methods that send tile and toast notifications have two alternative parameter signatures:

```
send*(pushUri, [options], [callback]) 
send*(pushUri, string1, string2, ..., [callback])
```

The ordering of the parameters in the non-object calling method assumes ordering as documented in the toast or tile-specific sections below.

For toasts, the properties and ordering for them:

* `text1` the text of the toast, this first text will appear bold on the phone
* `text2` additional toast text, will appear in the normal font. It does not wrap.
* `param` optional URI parameter within your application specifying the XAML page to open within the app, along with any query string parameters for the page's context

### Sending a live tile update
To send a tile update, call the `sendTile` method on mpns.

It is recommended that you use the options syntax for this call as it is possible for the live tile update to include just one component in the update, say the tile count, and not update other properties. To clear the value of a property, simply pass `null` as the value.

The option names or ordering for parameters is:

* `backgroundImage` URI to the background image for the tile. Beware that the URI may be restricted to the whitelisted domain names that you provided in your application.
* `count` the number to appear in the tile
* `title` the title of the tile
* `backBackgroundImage` URI to the image to be on the flip side of the tile
* `backTitle` optional title for the back tile
* `backContent` optional content for the back tile (appears in a larger font size)
* `id` optional ID for a secodary tile

Some devices support an enhanced tile format called a "flip tile", which supports some additional parameters. This kind of tile can be sent using the `sendFlipTile` method, which supports *all of the above* parameters as well as:
* `smallBackgroundImage` URI to the background image for the tile when it is shrunk to small size
* `wideBackgroundImage` URI to the background image for the tile when it is expanded to wide size
* `wideBackContent` content for the back tile (appears in a larger font size) when the tile is expanded to wide size
* `wideBackBackgroundImage` URI to the image to be on the flip side of the tile when the tile is expanded to wide size

### Sending a raw notification
When creating the notification object, either provide the raw payload first, or as the `options.payload` property.

```javascript
var raw = new mpns.rawNotification('My Raw Payload', options);
```

Today the type on the request is set to UTF8 explicitly.

### Using authenticated channels (MTLS)
You may use authenticated channels for the push notifications. Further information can be found here:http://msdn.microsoft.com/en-us/library/windowsphone/develop/ff941099(v=vs.105).aspx

Authenticated channels require a TLS client certificate for client authentication against the MPNS server.
The TLS certificate is registered in your Microsoft Phone Development Dashboard.
The CN of the certificate is used in the APP as Service Name in the HttpNotificationChannel constructor.

To use authentication you must provide the client certificate (including the private key) to the options of the send* functions.
The client certificate is used when the pushURI is a https URI.

The following options from tls.connect() can be specified:

* `pfx` Certificate, Private key and CA certificates to use for SSL. Default null.
* `key` Private key to use for SSL. Default null.
* `passphrase`  A string of passphrase for the private key or pfx. Default null.
* `cert` Public x509 certificate to use. Default null.
* `ca` An authority certificate or array of authority certificates to check the remote host against.
* `ciphers` A string describing the ciphers to use or exclude.
* `rejectUnauthorized` If true, the server certificate is verified against the list of supplied CAs. An 'error' event is emitted if verification fails. Verification happens at the connection level, before the HTTP request is sent. Default true.

```javascript
var options = { 
	text1: 'Hello!',
	text2: 'Great to see you today.'
	cert: fs.readFileSync('mycert.pem'),
	key: fs.readFileSync('mycertkey.pem')
	};

mpns.sendToast(httpspushUri, options, callback);
```

### HTTP proxy support

If the options passed into a tile or push call include a `proxy` value, the proxy server information will be used. The string value should be the URI to the proxy, including host, for example: `{ proxy: 'http://yourproxy:8080'}`.

### Results object information
A results object is passed back through the callback and has important information from MPNS.

- `deviceConnectionStatus`: The device status as reported by the service.
- `notificationStatus`: The status of your provided notification.
- `subscriptionStatus`: The status of the subscription URI.

The object will also contain all the key fields for your toast or live tile update, plus the pushType. This makes it easy to store this information in a history log somewhere in the ether.

### Handling Errors
It is very important as a consumer that you store appropriate actionable data about failed push notification attempts. As a result, the callback's first parameter (err) is set to the standard results object as well as a few additional fields depending on the returned status code from the server.

Remember to take action on that information in order to be a good MPNS citizen. These values may be set in the error object and of interest to you:

- `minutesToDelay`: If this is present, it is the suggested minimum amount of time that you should wait until making another request to the same subscription URI. For HTTP 412s, for example, the minimum time is one hour and so the returned value defaults to 61.
- `shouldDeleteChannel`: If this is set to `true`, the channel is gone according to MPNS. Delete it from your channel/subscription database and never look back.
- `innerError`: If an error is captured while trying to make the HTTP request, this will be set to that error callback instance.

### A note about different Windows Phone versions
This module permits sending toasts and tiles supported only on specific versions of Windows Phone. If you use those features on a version where they are unsupported, unfortunately notifications may not be received, or will error out the subscription.

Take care when registering your subscription channels with your cloud service to include the application platform version of the app (7.1 for Mango apps). To rock, maybe also grab the OS version and deployed app version. That information can be helpful when supporting customers.

Here is a list of features that are only supported in given versions of Windows Phone:
* For Windows Phone 7.0
	* Do not use the `param` or other fields as indicated below and it should work OK.
* Only supported in Windows Phone 7.5+ (Mango/WP 7.1 OS)
    * Including the `param` field when sending a push
    * Including the `id` parameter when sending a tile
* Only supported in Windows Phone 7.8+ (including Windows Phone 8)
    * Sending "flip" tiles

## Credits

NPM module written and maintained by [Jeff Wilcox] with contributions from:

- Jeff Wilcox : https://github.com/jeffwilcox
- Shawn Burke : https://github.com/shawnburke
- Jeremie Pelletier : https://github.com/ddude
- Yavor Georgiev: https://github.com/yavorg
- Stephan Eckbauer: https://github.com/ste99

## License

Copyright Jeff Wilcox

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

[Jeff Wilcox]: http://www.jeff.wilcox.name
[npm]: http://github.com/isaacs/npm

## Changelog

The changelog has moved over time.

* 1.2.8 and newer: The GitHub releases feature provides this information at https://github.com/jeffwilcox/mpns/releases
* 0-1.2.8: Available in the [CHANGELOG.md](https://github.com/jeffwilcox/mpns/blob/master/CHANGELOG.md) markdown file

