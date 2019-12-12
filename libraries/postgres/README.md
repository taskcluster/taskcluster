# Postgres Library

## TODO

* WRITE README [dustin]
  * Overall plan is: access is only through plpgsql functions, and those must
    have a consistent API (args + result).  Upgrades can redefine these
    functions and add new functions, but not change API as existing software may
    be using those functions concurrently.

* Write RFC [hassan]

* Database / Schema Class [hassan]
  * define a Version class and use it for validating version files, and define an update method
    * with tests for that validation
  * validate that method names are unique
  * use procedure names with uppercase letters to ensure that quoting of identifiers is correct
  * move JS methods to `this.db.procs.<methodname>`
  * add a serviceName for each method, and a serviceName argument to database.setup(), and do not allow service A to call any methods for service B which have mode=WRITE

* Database update support [dustin]
  * Some way to run updates from `yarn` scripts (similar to `yarn dev:apply`)
  * Better way of handling logging during database update

* database user permissions, and a user per service
