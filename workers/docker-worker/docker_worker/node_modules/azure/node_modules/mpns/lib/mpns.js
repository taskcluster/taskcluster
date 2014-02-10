// Copyright Jeff Wilcox
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

// Suggested fallback values if you're storing results in a document/db.
// See also: http://msdn.microsoft.com/en-us/library/ff941100%28v=VS.92%29.aspx
var HTTP_412_MINIMUM_DELAY_MINUTES = 61;
var ERROR_MINIMUM_DELAY_MINUTES = 5;

var url = require('url'),
    http = require('http'),
    https = require('https');

var Toast = function(options) {
    return new PushMessage('toast', '2', 'toast', options);
};

var LiveTile = function(options) {
    return new PushMessage('tile', '1', 'token', options);
};

var FlipTile = function(options) {
    if(!options){
        options = {};
    }
    options.tileTemplate = 'FlipTile';
    return new PushMessage('tile', '1', 'token', options);
};

var RawNotification = function(payload, options) {
    if (options === undefined) {
        options = payload;
    } else {
        options.payload = payload;
    }
    return new PushMessage('raw', '3', undefined, options);
};

function PushMessage(pushType, quickNotificationClass, targetName, options) {
    this.pushType = pushType;
    this.notificationClass = quickNotificationClass;
    this.targetName = targetName;

    if (options) {
        copyOfInterest(options, this, properties.ofInterest, this.pushType === 'tile');
        copyOfInterest(options, this, properties.ssl);
        copyOfInterest(options, this, properties.http);
    }
}

PushMessage.prototype.send = function(pushUri, callback) {
    var payload = this.getXmlPayload();
    var me = this;

    var options = url.parse(pushUri);
    options.method = 'POST';
    options.headers = {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(payload).toString(),
        'Accept': 'application/*',
        'X-NotificationClass': this.notificationClass
    };

    if(this.targetName){
        options.headers['X-WindowsPhone-Target'] = this.targetName;
    }

    if (this.proxy) {
        var proxyOptions = url.parse(this.proxy);
        options.headers['Host'] = options.host;
        options.path = options.href;
        options.host = proxyOptions.host;
        options.hostname = proxyOptions.hostname;
        options.port = proxyOptions.port;
    }

    var result = { };
    var err;
    var protocol = http;
    if (options.protocol == 'https:') {
        protocol = https;

        copyOfInterest(me, options, properties.ssl);

        //opt out of connection pooling -  otherwise error handling gets a lot more complicated
        options.agent = false;
    }

    var req = protocol.request(options);

    req.on('response', function (message) {
        result.statusCode = message.statusCode;
        // Store the important responses from MPNS.
        if (message.headers) {
            renameFieldsOfInterest(message.headers, result, {
                'x-deviceconnectionstatus': 'deviceConnectionStatus',
                'x-notificationstatus': 'notificationStatus',
                'x-subscriptionstatus': 'subscriptionStatus'
            });
        }

        // Store the fields that were sent to make it easy to log.
        copyOfInterest(me, result, properties.ofInterest, this.pushType === 'tile');

        switch (message.statusCode) {
            // The device is in an inactive state.
           case 412:
                result.minutesToDelay = HTTP_412_MINIMUM_DELAY_MINUTES; // Must be at least an hour.
                err = result;
                break;

            // Invalid subscriptions.
            case 400:
            case 401:
            case 404:
                result.shouldDeleteChannel = true;
                err = result;
                break;

            case 403:
                err = result;
                err.innerError = 'Authenticated push notifications certificate problem.';
                break;

            // Method Not Allowed (bug in this library)          
            case 405:
                err = result;
                break;

            case 406:
                err = result;
                err.innerError = 'Per-day throttling limit reached.';
                break;

            case 503:
                err = result;
                result.minutesToDelay = ERROR_MINIMUM_DELAY_MINUTES;
                err.innerError = 'The Push Notification Service is unable to process the request.';
                break;
        }

        // The message object received in the 'response' event is a stream, 
        // and must be consumed since Node.js version 0.10.x before the 
        // connection is released back to the pool.
        message.resume();

        if (callback)
            callback(err, err === undefined ? result : undefined);
    });

    req.on('error', function(e)
    {
        result.minutesToDelay = ERROR_MINIMUM_DELAY_MINUTES; // Just a recommendation.
        err = result;
        err.innerError = e;

        if (callback)
            callback(err);
    });

    // Send the push notification to Microsoft.
    req.write(payload);
    req.end();
};

function copyOfInterest(source, destination, fieldsOfInterest, allowNull) {
    if (source && destination && fieldsOfInterest && fieldsOfInterest.length) {
        for (var i = 0; i < fieldsOfInterest.length; i++) {
            var key = fieldsOfInterest[i];
            if (source[key] || (source[key] === null && allowNull === true)) {
                destination[key] = source[key];
            }
        }
    }
}

function renameFieldsOfInterest(source, destination, map) {
    if (source && destination && map) {
        for (var key in map) {
            var newKey = map[key];
            if (source[key]) {
                destination[newKey] = source[key];
            }
        }
    }
}

PushMessage.prototype.getXmlPayload = function() {
    this.validate();
    if (this.pushType == 'tile') {
        return tileToXml(this);
    } else if (this.pushType == 'toast') {
        return toastToXml(this);
    } else if (this.pushType == 'raw') {
        return this.payload;
    }
};

PushMessage.prototype.validate = function() {
    if (this.pushType != 'toast' && this.pushType != 'tile' && this.pushType != 'raw') {
        throw new Error("Only 'toast', 'tile' and 'raw' push types are currently supported.");
    }
};

function escapeXml(value) {
    if (value && value.replace) {
        value = value.replace(/\&/g,'&amp;')
                     .replace(/</g, '&lt;')
                     .replace(/>/g, '&gt;')
                     .replace(/"/g, '&quot;');
    }
    return value;
}

function getPushHeader(type, attributes) {
    return '<?xml version="1.0" encoding="utf-8"?><wp:Notification xmlns:wp="WPNotification">' +
        startTag(type, attributes);
}

function getPushFooter(type) {
    return endTag(type) + endTag('Notification');
}

function startTag(tag, attributes, endInstead) {
    tag = '<' + (endInstead ? '/' : '')  + 'wp:' + tag;
    if(!endInstead && attributes && attributes.length){
        attributes.forEach(function(pair){
            tag += ' ' + pair[0] + '="' + escapeXml(pair[1]) + '"';
        });
    }
    tag += '>';
    return tag;
}

function endTag(tag) {
    return startTag(tag, null, true);
}

function wrapValue(object, key, name) {
    // We want to clear the value
    if(object[key] === null){
        return startTag(name, [['Action', 'Clear']]) + endTag(name);
    } else {
        return object[key] ? startTag(name) + escapeXml(object[key]) + endTag(name) : '';
    }
}

function toastToXml(options) {
    var type = 'Toast';
    return getPushHeader(type) +
        wrapValue(options, 'text1', 'Text1') +
        wrapValue(options, 'text2', 'Text2') +
        wrapValue(options, 'param', 'Param') +
        getPushFooter(type);
}

function tileToXml(options) {
    var type = 'Tile';
    return getPushHeader(type, tileGetAttributes(options)) +
        wrapValue(options, 'backgroundImage', 'BackgroundImage') +
        wrapValue(options, 'count', 'Count') +
        wrapValue(options, 'title', 'Title') +
        wrapValue(options, 'backBackgroundImage', 'BackBackgroundImage') +
        wrapValue(options, 'backTitle', 'BackTitle') +
        wrapValue(options, 'backContent', 'BackContent') +
        wrapValue(options, 'smallBackgroundImage', 'SmallBackgroundImage') +
        wrapValue(options, 'wideBackgroundImage', 'WideBackgroundImage') +
        wrapValue(options, 'wideBackContent', 'WideBackContent') +
        wrapValue(options, 'wideBackBackgroundImage', 'WideBackBackgroundImage') +
        getPushFooter(type);
}

function tileGetAttributes(options){
    var attributes = [];
    if(options.tileTemplate){
        attributes.push(['Template', options.tileTemplate]);
    }
    if (options.id){
        attributes.push(['Id', options.id]);
    }
    return attributes;
}

function create(type, typeProperties, objectType, args) {
    var params = {};
    if (typeof args[0] === 'object') {
        var payload = Array.prototype.shift.apply(args);

        // Adding back support for legacy 'smallbackgroundTile' property name,
        // the removal of which was breaking backwards compat
        if (payload.smallbackgroundImage) {
            payload.smallBackgroundImage = payload.smallbackgroundImage;
        }

        copyOfInterest(payload, params, typeProperties, type === 'tile');
        copyOfInterest(payload, params, properties.ssl, false);
        copyOfInterest(payload, params, properties.http, false);
    }
    else {
        // assume parameters are provided as atomic, string arguments of the function call
        var i = 0;
        while ((typeof args[0] === 'string' || typeof args[0] === 'number') && i < typeProperties.length) {
            var item = Array.prototype.shift.apply(args);
            var key = typeProperties[i++];
            params[key] = item;
        }
    }

    if (type == 'toast' && typeof params.text1 !== 'string') {
        throw new Error('The text1 toast parameter must be set and a string.');
    }

    if (type == 'tile' && Object.keys(params).length === 0) {
        throw new Error('At least 1 tile parameter must be set.');
    }

    return new objectType(params);
}

function send(type, typeProperties, objectType, args) {
    var pushUri = Array.prototype.shift.apply(args);

    if (typeof pushUri !== 'string')
        throw new Error('The pushUri parameter must be the push notification channel URI string.');

    var callback = args[args.length - 1];

    if (callback && typeof callback !== 'function')
        throw new Error('The callback parameter, if specified, must be the callback function.');

    var instance = create(type, typeProperties, objectType, args);
    instance.send(pushUri, callback);
}

var properties = {
    http: [
        'proxy'
    ],
    ssl: [
        'pfx',
        'key',
        'passphrase',
        'cert',
        'ca',
        'ciphers',
        'rejectUnauthorized'
    ],
    toast: [
        'text1',
        'text2',
        'param'
    ],
    tile: [
        'backgroundImage',
        'count',
        'title',
        'backBackgroundImage',
        'backTitle',
        'backContent',
        'id'
    ],
    flipTile: [
        'smallBackgroundImage',
        'wideBackgroundImage',
        'wideBackContent',
        'wideBackBackgroundImage'
    ],
    ofInterest: [
        'payload',
        'pushType',
        'tileTemplate'
    ]
};

properties.flipTile = properties.flipTile.concat(properties.tile);
properties.ofInterest = properties.ofInterest.concat(properties.toast, properties.flipTile);

module.exports = {
    sendTile: function () {
        send('tile', properties.tile, LiveTile, arguments);
    },

    sendFlipTile: function() {
        send('tile', properties.flipTile, FlipTile, arguments);
    },

    sendToast: function () {
        send('toast', properties.toast, Toast, arguments);
    },

    sendRaw: function () {
        send('raw', ['payload'], RawNotification, arguments);
    },

    createTile: function () {
        return create('tile', properties.tile, LiveTile, arguments);
    },

    createFlipTile: function() {
        return create('tile', properties.flipTile, FlipTile, arguments);
    },

    createToast: function () {
        return create('toast', properties.toast, Toast, arguments);
    },

    createRaw: function () {
        return create('raw', ['payload'], RawNotification, arguments);
    },

    // Used for testing
    Properties: properties
};
