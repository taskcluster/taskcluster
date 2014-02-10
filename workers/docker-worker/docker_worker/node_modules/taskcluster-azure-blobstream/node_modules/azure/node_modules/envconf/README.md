envconf
===========

This module makes it easy to use express-style configuration for any application.
It allows your users to define separate configuration environments in code
and switch between sets of configuration via a single environment variable.

## Basic Usage

```javascript

var envconf = require('envconf');

var c = envconf.createConfig();

c.configure('development', function (c) {
  c.set('settingOne', 'devValue');
});

c.configure('production', function (c) {
  c.set('settingTwo', 'prodValue');
});

c('development').get('settingOne').should.equal('devValue');

process.env.NODE_ENV = 'production';
c.default.get('settingTwo').should.equal('prodValue');
```

The previous code shows picking up the default environment from the NODE_ENV environment variable.

You can however configure your own environment variables as shown below.

```javascript

var c2 = envconf.createConfig({ defaultEnvVar: 'MY_LIBRARY_VAR'});

c2.configure('development', function (c) {
  c.set('settingOne', 'devValue');
});

c2.configure('production', function (c) {
  c.set('settingTwo', 'prodValue');
});

c2('development').get('settingOne').should.equal('devValue');

process.env.MY_LIBRARY_VAR = 'production';
c.default.get('settingTwo').should.equal('prodValue');
```

## Setting Getters

Instead of a setting a simple value, you can instead use the setFunc method to
provide a function that will run when the value is requested:

```javascript
var c2 = envconf.createConfig();

c2.configure('development', function (c) {
  c.setFunc('settingOne', function () { return 'This value came from a function'; });
});

c2.get('settingOne').should.equal('This value came from a function');
```

This can be handy if you want to have a default value that you need to derive from
ambient state.

## Customizing the config object

Do you want to add helper methods for your specific configuration? Or set specific
values in every configuration? It's easy with a config customizer:

```javascript

function addConfigHelpers(config) {
  config.useSql = function (host, db) {
    config.set('sql host', host);
    config.set('sql database name', db);
  }
}

var c3 = envconf.createConfig( { customizer: addConfigHelpers });

c3.configure('test', function (c) {
  c.useSql('testmachine', 'testdb');
});

c3.configure('production', function (c) {
  c.useSql('realDatabase', 'actualDb');
});
```

## Saving and Restoring config values

Are you making changes to a global configuration in your unit tests, and want
to ensure you've restored the state after your test? Use a snapshot:

```javascript

var c4 = envconf.createConfig();
c4.configure(function (c) {
  c.set('originalValue', 'one');
});

// set up contents of c4

var snapshot = c4.snapshot();

c4.configure(function (c) {
  c.set('originalValue', 'two');
});

c4.restore(snapshot);

c4.get('originalValue').should.equal('one');
```

Snapshot/restore also saves and restores any child configurations.

## Temporary Configs

Similarly, you might want to set up a configuration and then be able
to throw it away without giving it a name. Easy:

```javascript

var c5 = envconf.createConfiguration();
c5.configure(function (c) {
  c.set('originalValue', 'one');
});

var c6 = envconf.tempConfig();
c6.set('tempValue', 'temp');

// You can look up values in the temp config or the parent
c6.get('tempValue').should.equal('temp');
c6.get('originalValue').should.equal('one');

// But the parent has no record of the temp
c5.environments.length.should.equal(0);
```
