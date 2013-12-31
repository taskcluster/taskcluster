<a href="http://promises-aplus.github.com/promises-spec">
    <img src="http://promises-aplus.github.com/promises-spec/assets/logo-small.png"
         align="right" alt="Promises/A+ logo" />
</a>

# Promise-Returning Tests for Mocha

So you really like [Mocha][]. But you also really like [promises][]. And you'd like to see
[support in Mocha][mocha-issue] for the promise-returning test style found in [Buster][] and others, i.e. stuff like

```js
it("should be fulfilled with 5", function () {
    return promise.then(function (result) {
        return result.should.equal(5);
    });
});
```

Or even better, if you are using [Chai as Promised][],

```js
it("should be fulfilled with 5", function () {
    return promise.should.become(5);
});
```

Until now you've been making do with [hacks][], or perhaps using [my fork of Mocha][mocha-fork], and hoping I rebase
often enough to keep things nice. But now, with Mocha as Promised, you have a much nicer option available!

## How to Use

Once you install and set up Mocha as Promised, you now have a second way of creating asynchronous tests, besides Mocha's
usual `done`-callback style. Just return a promise: if it is fulfilled, the test passes, and if it is rejected, the test
fails, with the rejection reason as the error. Nice, huh?

If you want to do multiple assertions in a single test, first, think carefully about whether you should instead break
that test up into multiple tests. Once you've decided that yes, you're really OK with multiple assertions, then you'll
want to use a promise-aggregator function, like [Q][]'s [`Q.all`][Q.all]:

```js
it("should be fulfilled with an object with the correct properties", function () {
    var userPromise = getUserAsynchronously();

    return Q.all([
        userPromise.should.eventually.be.an("object"),
        userPromise.should.eventually.have.property("id", 123),
        userPromise.should.eventually.have.property("firstName", "Domenic"),
        userPromise.should.eventually.have.property("lastName", "Denicola")
    ]);
});
```

(Once again I'll plug my [Chai as Promised][] library, so you can do super-awesome “eventual” assertions like these.)

Moch as Promised works with all Mocha interfaces: BDD, TDD, QUnit, whatever. It hooks in at such a low level, the
interfaces don't even get involved.

## Installation and Usage

### Node

Do an `npm install mocha-as-promised --save-dev` to get up and running. Then:

```javascript
require("mocha-as-promised")();
```

You can of course put this code in a common test fixture file; for an example, see
[the Mocha as Promised tests themselves][fixturedemo].

### AMD

Mocha as Promised supports being used as an [AMD][amd] module, registering itself anonymously. So, assuming you have
configured your loader to map the Mocha and Mocha as Promised files to the respective module IDs `"mocha"` and
`"mocha-as-promised"`, you can use them as follows:

```javascript
define(function (require, exports, module) {
    var mocha = require("mocha");
    var mochaAsPromised = require("mocha-as-promised");

    mochaAsPromised(mocha);
});
```

### `<script>` tag

If you include Mocha as Promised directly with a `<script>` tag, after the one for Mocha itself, then it will
automatically plug in to Mocha and be ready for use:

```html
<script src="mocha.js"></script>
<script src="mocha-as-promised.js"></script>
```

### Node, the Advanced Version

The `require("mocha-as-promised")()` above tries to detect which instance of Mocha is being used automatically. This
way, Mocha as Promised can plug into either the local Mocha instance installed into your project, or into the global
Mocha instance if you're running your tests using the globally-installed command-line runner.

In some cases, if you're doing something weird, this can fall down. In these cases, you can pass an array of Mocha
instances into the Mocha as Promised function. For example, if you somehow had your Mocha module as a property of the
`foo` module, instead of it being found in the usual npm directory structures, you would do

```javascript
require("mocha-as-promised")([require("foo").MyMocha]);
```

## How Does This Work!?

**Black magic**. No, seriously, this is a big hack.

The essential strategy is to intercept any test functions that Mocha runs, and inspect their return values. If they
return a promise, then translate fulfillment/rejection appropriately. It's explained in more detail how exactly this is
done in a large comment block at the top of the source. You can also check out [`d98f2d9`][] for an alternative
approach at the interception, which was abandoned in favor of the current one.

Note that Mocha as Promised *doesn't* just override `Runnable.prototype.run`, as is done by [my Mocha fork][mocha-fork].
That seemed a bit too fragile to be a long-term solution. The interception approach involves more black magic, but
is probably more resilient in the face of upstream changes. At least, that's the hope.


[Mocha]: http://visionmedia.github.com/mocha/
[promises]: http://www.slideshare.net/domenicdenicola/callbacks-promises-and-coroutines-oh-my-the-evolution-of-asynchronicity-in-javascript
[Buster]: http://busterjs.org/
[mocha-issue]: https://github.com/visionmedia/mocha/pull/329
[Chai as Promised]: https://github.com/domenic/chai-as-promised/
[hacks]: https://github.com/domenic/chai-as-promised/#working-with-non-promise%E2%80%93friendly-test-runners
[mocha-fork]: https://github.com/domenic/mocha/tree/promises
[Q]: https://github.com/kriskowal/q
[Q.all]: https://github.com/kriskowal/q#combination
[fixturedemo]: https://github.com/domenic/mocha-as-promised/tree/master/test/
[grunt-mocha-test]: https://npmjs.org/package/grunt-mocha-test
[amd]: https://github.com/amdjs/amdjs-api/wiki/AMD
[`d98f2d9`]: https://github.com/domenic/mocha-as-promised/commit/d98f2d95197896cd7b948b6208cb6c1235f43eed
