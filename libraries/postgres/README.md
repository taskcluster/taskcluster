# Postgres Library

## TODO

* WRITE README
  * Overall plan is: access is only through plpgsql functions, and those must
    have a consistent API (args + result).  Upgrades can redefine these
    functions and add new functions, but not change API as existing software may
    be using those functions concurrently.
* Database / Schema Class
  * store schema versions in an array, not a map
  * define a Version class and use it for validating version files, and define an update method


