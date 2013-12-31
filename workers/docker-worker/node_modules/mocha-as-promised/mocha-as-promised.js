(function (mochaAsPromised) {
    "use strict";

    function findNodeJSMocha(moduleToTest, suffix, accumulator) {
        if (accumulator === undefined) {
            accumulator = [];
        }

        if (moduleToTest.id.indexOf(suffix, moduleToTest.id.length - suffix.length) !== -1 && moduleToTest.exports) {
            accumulator.push(moduleToTest.exports);
        }

        moduleToTest.children.forEach(function (child) {
            findNodeJSMocha(child, suffix, accumulator);
        });

        return accumulator;
    }

    // Module systems magic dance.

    if (typeof require === "function" && typeof exports === "object" && typeof module === "object") {
        // Node.js: plug in automatically, if no argument is provided. This is a good idea since one can run Mocha tests
        // using the Mocha test runner from either a locally-installed package, or from a globally-installed one.
        // In the latter case, naively plugging in `require("mocha")` would end up duck-punching the wrong instance,
        // so we provide this shortcut to auto-detect which Mocha package needs to be duck-punched.
        module.exports = function (mochaModules) {
            if (mochaModules === undefined) {
                if (typeof process === "object" && Object.prototype.toString.call(process) === "[object process]") {
                    // We're in *real* Node.js, not in a browserify-like environment. Do automatic detection logic.

                    // Funky syntax prevents Browserify from detecting the require, since it's needed for Node.js-only
                    // stuff.
                    var path = (require)("path");
                    var suffix = path.join("mocha", "lib", "mocha.js");
                    mochaModules = findNodeJSMocha(require.main, suffix);

                    if (mochaModules === undefined) {
                        throw new Error("Attempted to automatically plug in to Mocha, but could not detect a " +
                                        "running Mocha module.");
                    }

                } else if (typeof Mocha !== "undefined") {
                    // We're in a browserify-like emulation environment. Try the `Mocha` global.
                    mochaModules = [Mocha];
                } else {
                    throw new Error("Attempted to automatically plug in to Mocha, but could not detect the " +
                                    "environment. Plug in manually by passing the running Mocha module.");
                }
            }

            mochaModules.forEach(mochaAsPromised);
        };
    } else if (typeof define === "function" && define.amd) {
        // AMD
        define(function () {
            return mochaAsPromised;
        });
    } else {
        // Other environment (usually <script> tag): plug in global `Mocha` directly and automatically.
        mochaAsPromised(Mocha);
    }
}((function () {
    "use strict";

    function getThen(x) {
        if ((typeof x === "object" || typeof x === "function") && x !== null) {
            var then = x.then;
            if (typeof then === "function") {
                return then;
            }
        }
    }

    return function mochaAsPromised(mocha) {
        if (mocha._mochaAsPromisedLoadedAlready) {
            return;
        }
        mocha._mochaAsPromisedLoadedAlready = true;

        // Soooo this is an awesome hack.

        // Here's the idea: Mocha `Runnable` instances have a `fn` property, representing the test to run. Async tests
        // in Mocha are done with `fn`s that take a `done` callback, and call it with either nothing (success) or an
        // error (failure). We want to add another paradigm for async tests: `fn`s that take no arguments, but return a
        // promise. Promise fulfillment corresponds to success, and rejection to failure.

        // To do this, we translate promise-returning `fn`s into callback-calling ones. So Mocha never sees the promisey
        // functions, but instead sees a wrapper around them that we provide. The only trick is, how and when to insert
        // this wrapper into a Mocha `Runnable`?

        // We accomplish this by intercepting all [[Put]]s to the `fn` property of *any* `Runnable`. That is, we define
        // a setter for `fn` on `Runnable.prototype` (!). So when Mocha sets the `fn` property of a runnable inside the
        // `Runnable` constructor (i.e. `this.fn = fn`), it is immediately translated into a wrapped version, which is
        // then stored as a `_wrappedFn` instance property. Finally we define a getter for `fn` on `Runnable.prototype`
        // as well, so that any retrievals of the `fn` property (e.g. in `Runnable.prototype.run`) return the wrapped
        // version we've stored.

        // We also need to override the `async` property, since the Mocha constructor sets it by looking at the `fn`
        // passed in, and not at the `this.fn` property we have control over. We just give it a getter that performs the
        // same logic as the Mocha constructor, and a no-op setter (so that it silently ignores Mocha's attempts to set
        // it).

        // ISN'T THIS COOL!?

        Object.defineProperties(mocha.Runnable.prototype, {
            fn: {
                configurable: true,
                enumerable: true,
                get: function () {
                    return this._wrappedFn;
                },
                set: function (fn) {
                    this._wrappedFn = function (done) {
                        // Run the original `fn`, passing along `done` for the case in which it's callback-asynchronous.
                        // Make sure to forward the `this` context, since you can set variables and stuff on it to share
                        // within a suite.
                        var retVal = fn.call(this, done);

                        var then = getThen(retVal);
                        if (then) {
                            // If we get a promise back...
                            then.call(
                                retVal,
                                function () {
                                    // On fulfillment, ignore the fulfillment value and call `done()` with no arguments.
                                    done();
                                },
                                function (reason) {
                                    // On rejection, make sure there's a rejection reason, then call `done` with it.
                                    if (reason === null || reason === undefined) {
                                        reason = new Error("Promise rejected with no rejection reason.");
                                    }
                                    done(reason);
                                }
                            );
                        } else if (fn.length === 0) {
                            // If `fn` is synchronous (i.e. didn't have a `done` parameter and didn't return a promise),
                            // call `done` now. (If it's callback-asynchronous, `fn` will call `done` eventually since
                            // we passed it in above.)
                            done();
                        }
                    };
                    this._wrappedFn.toString = function () {
                        return fn.toString();
                    };
                }
            },
            async: {
                configurable: true,
                enumerable: true,
                get: function () {
                    return typeof this._wrappedFn === "function";
                },
                set: function () {
                    // Ignore Mocha trying to set this; it doesn't know the whole picture.
                }
            }
        });
    };
}())));
