YAML Configuration Loader
=========================

This modules makes it easy to load configuration from YAML files, and allows
these YAML files to specify environment variables to substitute into the
configuration.

The **configuration format** looks as follows.
```yaml
defaults:
  hostname:     localhost
  port:         8080
production: # profile 'production'
  hostname:   !env HOSTNAME
  port:       !env:number PORT
test: # profile 'test'
  hostname:   localhost
  port:       1234
```
The syntax extensions `!env <name>` is replaced with the value of the
environment variable `<name>`. This is further extended to support loading
types other than strings from environment variables. In the example above
`!env:number PORT` will be replaced by the value of the environment variable
`PORT` parsed as a number. If parsing the environment variable fails, it'll
instead be replaced with `undefined`.

This library support for the following syntax extensions:

 * `!env <NAME>`, load string from env variable `<NAME>`,
 * `!env:string <NAME>`, load string from env variable `<NAME>`.
 * `!env:number <NAME>`, load number from env variable `<NAME>`.
 * `!env:flag <NAME>`, load true if env variable `<NAME>` is defined,
 * `!env:bool <NAME>`, load boolean as /true/i or /false/i from env
    variable `<NAME>`,
 * `!env:json <NAME>`, load JSON object from env variable `<NAME>`, and,
 * `!env:list <NAME>`, load list of space separated strings from env
    variable `<NAME>`.

When **loading configuration** you may specify which files, profile and
environment variables to load from. But default the following is options is
given. So if you name your files `config.yml` and `user-config.yml` you can
load configuration with `config({profile: 'my-profile'})`.
```js
var config = require('typed-env-config');

var cfg = config({
  files: [                // Files to load configuration from
   'config.yml',          // These defaults are relative to process.cwd
   'user-config.yml'
  ]
  profile:  undefined,    // Profile to apply (default to none)
  env:      process.env   // Environment variables (mapping string to strings)
});

// cfg is now an object...
```

The configuration loader will not complain about missing or ill formated
environment variables, instead it'll just evaluate them to `undefined`. Nor will
the configuration loader complain about missing files, but it will complain
about ill formated files and missing profiles.

If you specify `{profile: 'test'}` when loading the example configuration file
listed at the top of this document, the loader will first load the `defaults`
section and then merge in values from the `test` section overwriting
values set in `defaults`.

If there is both a `config.yml` and `user-config.yml` file, the `config.yml`
will be loaded first and have the profile merged, before the `user-config.yml`
file is loaded and has it profile merged in on top of the `config.yml` file.
Obviously, you can reverse the order and specify other file names using the
`files` option for the config loader.
