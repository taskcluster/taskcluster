# Development Process

Welcome to Taskcluster development!

Taskcluster is composed of a bunch of microservices, some libraries, the React user interface, some client libraries, and a bunch of infrastructure to glue it all together.
You will probably be working on only one of these pieces, so read carefully below to see what you need to do.

## Setup

### Node

<!-- the next line is automatically edited; do not change -->
You will need Node version 16.15.1 installed.
We recommend using https://github.com/nvm-sh/nvm to support installing multiple Node versions.

We use `yarn` to run most development commands, so [install that as well](https://classic.yarnpkg.com/en/docs/install/#debian-stable).

### Go

<!-- the next line is automatically edited; do not change -->
Go version go1.18.3 is required for some development tasks, in particular to run `yarn generate`.
For new contributors not familiar with Go, it's probably safe to skip installing Go for now -- you will see a helpful error if and when it is needed.
We recommend using https://github.com/moovweb/gvm to support installing multiple Go versions.

### Rust

You do not need Rust installed unless you are working on one of the Rust components of Taskcluster.
The currently-required version of Rust is in `rust-toolchain`.

### Postgres

All Taskcluster services require a Postgres 11 server to run.
The easiest and best way to do this is to use docker, but if you prefer you can install a Postgres server locally.
*NOTE* the test suites repeatedly drop the `public` schema and re-create it, effectively deleting all data in the database.
Do not run these tests against a database instance that contains any useful data!

To start the server using Docker:

```shell
docker run -ti -p 127.0.0.1:5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e LC_COLLATE=en_US.UTF8 -e LC_CTYPE=en_US.UTF8 --rm postgres:11
```

This will run Docker in the foreground in that terminal (so you'll need to use another terminal for your work, or add the `-d` flag to daemonize the container) and make that available on TCP port 5432, the "normal" Postgres port.

It can be helpful to log all queries run by the test suite:

```shell
docker run -ti -p 127.0.0.1:5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e LC_COLLATE=en_US.UTF8 -e LC_CTYPE=en_US.UTF8 --rm postgres:11 -c log_statement=all
```

However you decide to run Postgres, you will need a DB URL, as defined by [node-postgres](https://node-postgres.com/features/connecting).
For the docker container described above, this is `postgresql://postgres@localhost/postgres`.
For tests, set:

```shell
export TEST_DB_URL=postgresql://postgres@localhost/postgres
```

To access the psql command-line prompt in your docker container, determine the container ID (such as with `docker container ls`) and run

```shell
docker exec -ti $CONTAINER_ID psql -U postgres
```

### Node Dependency Installation

To set up the repository, run `yarn` in the root directory.
This will install all required dependencies from the Yarn registry.

For some of the commands below, such as `mocha`, you will need to make sure that `node_modules/.bin` is in your PATH.
To set this up, in the root directory, run

```sh
export PATH=$PWD/node_modules/.bin:$PATH
```

### Pre-Commit (*Optional*)

We recommend installing [pre-commit](https://pre-commit.com/index.html) for small checks that run before each commit, such as trailing whitespace, making sure files end in a newline, checking for merge conflict strings, etc.

* Install [pre-commit](https://pre-commit.com/index.html#install)
* Install the git hook scripts with `pre-commit install`
* Done! `pre-commit` will now run automatically on `git commit`!

These checks will help keep the code clean and will potentially save CI resources if issues are caught pre-commit.

## Hacking on the UI

Taskcluster requires a Linux-like environment for development.
If you are developing on a Windows system, you will need to either
* install [WSL](https://docs.microsoft.com/en-us/windows/wsl/install-win10)
* use a virtual machine for development or
* install Linux as a second OS and boot into that.

The files comprising the Taskcluster UI are under [`ui/`](../ui).
It relies on a microservice called web-server, which you will need to run in a different terminal window.
To run the Taskcluster UI:

* In a shell window for taskcluster-web-server:
  * Make sure Postgres is set up as described above.
  * Set both `READ_DB_URL` and `WRITE_DB_URL` to the URL for your postgres server, as described above.
    For example:
    ```sh
    export READ_DB_URL=postgresql://postgres@localhost/postgres
    export WRITE_DB_URL=postgresql://postgres@localhost/postgres
    ```
  * Set `TASKCLUSTER_ROOT_URL` to point to a Taskcluster deployment you wish to represent in the UI.
    For example:

    ```sh
    export TASKCLUSTER_ROOT_URL=https://community-tc.services.mozilla.com
    ```
  * Change to the `services/web-server` directory and run `yarn start`.
    This will start a web server on port 3050.

    > *Note 1*: It will warn "No Pulse namespace defined". <br />
              Unless you are working on parts of the UI that require Pulse support (and most do not), this is OK. <br />
    > *Note 2*: If you get an error like `readDbUrl is required`, ensure you've set all the above mentioned environment variables in the same shell session.

* In another shell window for taskcluster-ui:
  * Change to the `ui/` directory.
  * Run `yarn` to install the user interface's dependencies.
    You will only need to do this when the dependencies change.
  * Run `yarn start` to start the development server.
    It will output a localhost URL on which you can see the site.

## Hacking on Services and Libraries

To run all of the tests for a service, change into the directory containing the service (for example, `cd services/queue`) and run `yarn test`.
Unless you provide additional credentials, some tests will be skipped, but unless you are working on the specific feature addressed by those tests, this is probably OK.
To be sure, follow the TDD practice of writing your tests first, ensuring that they fail before you fix the bug or add the feature.
If your new test is skipped, then consult with one of the Taskcluster team members to see how you can get some credentials.
Otherwise, all tests will run when you make a pull request, and we can address any issues at that time.

If you have a running Postgres server, you can set `TEST_DB_URL` to the DB URL determined above.
But for most changes, the mock tests are sufficient to detect errors, and a Postgres server is not necessary.

To run a specific test file, you can use `mocha` directly:

```sh
# run just the `api_test` file
mocha test/api_test.js
# run the tests in that file until the first failure
mocha -b test/api_test.js
```

All of the server-side code runs in Node, and uses the [debug](https://yarnpkg.com/en/package/debug) module to log debugging information.
You can see all debugging output with

```sh
export DEBUG=*
```

and can filter out specific debugging output with other values, as described in the [module documentation](https://github.com/visionmedia/debug/blob/master/README.md).

## Generating Code

If you change the API for a service (even changing documentation), you will need to regenerate the API references.
Happily, this is easy.
In the root directory of the repository, run `yarn generate`.
It will change a few files, and you should include those changes in your Git commit.

## Running Services Locally

We generally depend on tests to ensure that services are behaving correctly.
It is rare to run a service directly.
However, it's possible!

Look in `procs.yml` in the service's directory to see what processes you can run.
For example, you might see:

```yaml
expireArtifacts:
  type: cron
  schedule: '0 0 * * *'
  deadline: 86400
  command: node services/queue/src/main expire-artifacts
```

To run this process locally:
```sh
NODE_ENV=development node services/queue/src/main expire-artifacts
```

You may need to provide additional configuration, either as environment variables or in `user-config.yml`.
You can find a template for `user-config.yml` in `user-config-example.yml`: just copy the latter to the former and edit it.

## Hacking on Clients

The client libraries are in `clients/`.

All clients contain a great deal of generated code.
Use `yarn generate`, as described above, to ensure that any changes you make are not overwritten by the code-generation system.

## Building the Taskcluster Docker Image

A Taskcluster deployment is based on a Docker image that contains all Taskcluster services, including the UI.
It's rare to use this image during development, as running the image requires lots of credentials and a special environment.

But you're welcome to build the image!
It's easy: `yarn build` in the root directory.

## Running everything locally using `docker-compose`

It is possible to run all web services locally using `docker-compose`.

[`docker-compose.yml`](../docker-compose.yml) is being autogenerated with `yarn generate` (`yarn generate --target docker-compose.yml`)

It defines dependencies: `postgres`, `rabbitmq`, `minio` (for S3 artifacts) and all web services.

User names and passwords can be seen in [`docker-compose.yml`](../docker-compose.yml).

```shell
# to run all containers
docker-compose up -d

# to stop them
docker-compose down

# to run only some
docker-compose up -d auth-web

# to run any task from entrypoint
docker-compose run --rm auth-web worker-manager/expire-workers
```

**Database** would be initiated with the help of [`docker/postgres/init.sql`](../docker/postgres/init.sql) script and `pg_init_db` service which runs migrations.

**Minio** (S3) will provision two buckets on first start: `public-bucket`, `private-bucket`.

All services would be served through `ingress` service which uses [`docker/nginx.conf`](../docker/nginx.conf).
UI can be accessed through [http://localhost:8080](http://localhost:8080).

To login, use `static/taskcluster/*` client ids and access tokens that can be seen in `AUTH_WEB` environment variable of `auth-web` service.

### Development and debugging using docker-compose

Docker compose is running latest `taskcluster/taskcluster` image, which might not include your recent local changes.
To be able to experiment with changes, simply mount local folders in the specific service:

```yaml
auth-web:
  ...
  volumes:
    - ./clients:/app/clients
    - ./services:/app/services
    - ./libraries:/app/libraries
```

Keep in mind that `docker-compose.yml` is autogenerated, and those changes shouldn't be commited.
If you need to save those mounts,
you can use [`docker-compose.override.yml`](https://docs.docker.com/compose/extends/#understanding-multiple-compose-files) file like this:

```yml
# docker-compose.override.yml

services:
  auth-web:
    volumes:
      - ./clients:/app/clients
      - ./services:/app/services
      - ./libraries:/app/libraries
```
