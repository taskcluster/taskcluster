# Config Library

This library makes it easy to load configuration from YAML files, and allows
these YAML files to specify environment variables to substitute into the
configuration.

Configuration Format
--------------------

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

The top-level properties are "profiles", with `default` being a special case
that supplies defaults for all profiles.

The syntax extensions `!env <name>` are replaced with the value of the
environment variable `<name>`. This is further extended to support loading
types other than strings from environment variables. In the example above
`!env:number PORT` will be replaced by the value of the environment variable
`PORT` parsed as a number. If parsing the environment variable fails, it'll
instead be replaced with `undefined`.

This library has support for the following syntax extensions:

 * `!env <NAME>`, load string from env variable `<NAME>`,
 * `!env:string <NAME>`, load string from env variable `<NAME>`.
 * `!env:number <NAME>`, load number from env variable `<NAME>`.
 * `!env:bool <NAME>`, load boolean as /true/i or /false/i from env
    variable `<NAME>`,
 * `!env:json <NAME>`, load JSON object from env variable `<NAME>`, and,
 * `!env:list <NAME>`, load list of space separated strings from env
    variable `<NAME>`.

Loading Configuration
---------------------

When **loading configuration** you may specify which files, profile and
environment variables to load from.  The resulting configuration is a
combination of all supplied files.  Files are parsed in order, with defaults
applied as each file is read.  Values appearing later in the process overwrite
those from earlier.

The default setting is to read from `config.yml` and `user-config.yml`, and
this is the normal means of configuring a Taskcluster service.  `config.yml` is
checked in, and `user-config.yml` is in `.gitignore` and used by developers to
provide credentials. So in most cases, services load load configuration with
`config({profile})` (where `profile` comes from `$NODE_ENV`).

The default options are shown here:
```js
var config = require('taskcluster-lib-config');

var cfg = config({
  files: [ // Files to load configuration from
   {path: 'config.yml', required: true}, // These defaults are relative to process.cwd
   {path: 'user-config.yml', required: false},
  ]
  profile:  undefined, // Profile to apply (default to none)
  env:      process.env, // Environment variables (mapping string to strings)
  getEnvVars: false, // If true, rather than returning configuration, this returns the list
                        of possible env vars
});
```

Then `cfg` is an object containing the result of the merge.

The configuration loader will not complain about missing or ill formated
environment variables. Instead it will just evaluate them to `undefined`. Nor will
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
