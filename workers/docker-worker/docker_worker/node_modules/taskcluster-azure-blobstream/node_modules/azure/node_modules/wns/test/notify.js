var wns = require('../lib/wns');

exports.createWnsContext = function (client_secret, client_id) {

    var result = {};
    var accessTokenContainer = {};

    // transform the sendTile*, sendToast*, and sendBadge methods exposed by wns module as follows:
    // - success and error callbacks are separate and specified as properties of the options object
    // - client_id and client_secret and provided by the application
    // - accessToken, if obtained, is cached by the application
    // - user can call these methods either with a single channel URL or with a channel array
    // - channel URL is passed to callbacks as part of the result or error object
    // - accessToken is not passed back to the caller throught the callback
    // - only x-wns-* HTTP response headers are returned in the result or error
    var createWnsWrapper = function (method, client_id, client_secret, accessTokenContainer) {
        var wnsMethod = wns[method];
        var wrapper = function () {

            var args = arguments;

            // if first argument is an array, call self recursively for each of the elements
            if (Array.isArray(arguments[0])) {
                var channels = arguments[0];
                channels.forEach(function (channel) {
                    args[0] = channel;
                    wrapper.apply(this, args);
                });

                return;
            }

            var channel = arguments[0];

            // determine if the optional options object is passed as the last parameter, assume empty if not
            var options;
            if (arguments.length > 2 && typeof arguments[arguments.length - 1] === 'object') {
                options = arguments[arguments.length - 1];
            }
            else {
                options = empty;
            }

            if (typeof options.success !== 'undefined' && typeof options.success !== 'function') {
                throw new Error('The options.success callback, if specified, must be a function.');
            }

            if (typeof options.error !== 'undefined' && typeof options.error !== 'function') {
                throw new Error('The options.error callback, if specified, must be a function.');
            }

            if (args.length > 1) {

                // do not bother adding options and callback if there is insufficient number of parameters passed
                // it will fail anyways
                // create callback to be passed to wns
                var callback = function (error, result) {

                    // sanitize result
                    [error, result].forEach(function (item) {
                        if (typeof item !== 'object' || item === null) {
                            return;
                        }

                        // if a new access token had been issued in the course of sending the WNS notification,
                        // cache it for subsequent use in this in memory container scoped to (client_id, client_secret)
                        if (item.newAccessToken) {
                            accessTokenContainer.accessToken = item.newAccessToken;
                            delete item.newAccessToken;
                        }

                        if (typeof item.headers === 'object') {
                            Object.getOwnPropertyNames(item.headers).forEach(function (header) {
                                if (header.toLowerCase().indexOf('x-wns-') !== 0) {
                                    delete item.headers[header];
                                }
                            });
                        }

                        // add channel information to result
                        item.channel = channel;
                    });

                    // call appropriate user callback
                    if (error) {
                        if (options.error) {
                            options.error(error);
                        }
                        else {
                            // TODO: do some logging of the error?
                        }
                    }
                    else if (options.success) {
                        options.success(result);
                    }
                };

                // create options to be passed to wns
                var wnsOptions = {};
                for (var i in options) {
                    wnsOptions[i] = options[i];
                }

                wnsOptions.client_id = options.client_id || client_id;
                wnsOptions.client_secret = options.client_secret || client_secret;
                wnsOptions.accessToken = options.accessToken || accessTokenContainer.accessToken;

                // massage arguments array to modify signature
                if (options === empty) {
                    Array.prototype.push.call(args, wnsOptions);
                }
                else {
                    args[args.length - 1] = wnsOptions;
                }

                Array.prototype.push.call(args, callback);
            }

            // finally call the wns method
            return wnsMethod.apply(this, args);
        };

        return wrapper;
    };

    for (var method in wns) {
        if (method.indexOf('send') === 0) {
            result[method] = createWnsWrapper(method, client_id, client_secret, accessTokenContainer);
        }
    }

    return result;
};

var empty = {};
