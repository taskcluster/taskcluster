# Development Process

Welcome to Taskcluster development!

Taskcluster is composed of a bunch of microservices, some libraries, the React user interface, some client libraries, and a bunch of infrastructure to glue it all together.
You will probably be working on only one of these pieces, so read carefully below to see what you need to do.

## Setup

### Node

<!-- the next line is automatically edited; do not change -->
You will need Node version 24.13.0 installed.
We recommend using https://github.com/nvm-sh/nvm to support installing multiple Node versions.

We use `yarn` to run most development commands, so [install that as well](https://classic.yarnpkg.com/en/docs/install/#debian-stable).

### Go

<!-- the next line is automatically edited; do not change -->
Go version go1.25.7 is required for some development tasks, in particular to run `yarn generate`.
For new contributors not familiar with Go, it's probably safe to skip installing Go for now -- you will see a helpful error if and when it is needed.
We recommend using https://github.com/moovweb/gvm to support installing multiple Go versions.

### Rust

You do not need Rust installed unless you are working on one of the Rust components of Taskcluster.
The currently-required version of Rust is in `rust-toolchain.toml`.

### Postgres

All Taskcluster services require a Postgres 15 server to run.
The easiest and best way to do this is to use docker, but if you prefer you can install a Postgres server locally.
*NOTE* the test suites repeatedly drop the `public` schema and re-create it, effectively deleting all data in the database.
Do not run these tests against a database instance that contains any useful data!

`pg_dump` is being used to detect schema changes. If it is not present on your system,
`yarn generate` might attempt to run this inside the `postgres` docker container, which is one of the `docker-compose.yml` services.

To start the server using Docker:

```shell
docker run -ti -p 127.0.0.1:5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e LC_COLLATE=en_US.UTF8 -e LC_CTYPE=en_US.UTF8 --rm postgres:15
```

This will run Docker in the foreground in that terminal (so you'll need to use another terminal for your work, or add the `-d` flag to daemonize the container) and make that available on TCP port 5432, the "normal" Postgres port.

It can be helpful to log all queries run by the test suite:

```shell
docker run -ti -p 127.0.0.1:5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e LC_COLLATE=en_US.UTF8 -e LC_CTYPE=en_US.UTF8 --rm postgres:15 -c log_statement=all
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

To be able to run the UI locally, you will need to set up a Taskcluster deployment to point to.
This can either be a local deployment using [docker compose](#development-mode) or a remote deployment such as [community-tc](https://community-tc.services.mozilla.com/).

If you just want to change the UI without changing the backend or graphql API, then you will only need the [latest node](#node) version and `yarn` installed:

```sh
cd ui
# install dependencies if needed
yarn
# set the Taskcluster deployment to point to
export TASKCLUSTER_ROOT_URL=https://community-tc.services.mozilla.com
# start the UI
yarn start
```

You will can now open the UI at <http://localhost:5080>. It will automatically reload when you make changes to the code.
All API calls would be proxied to the Taskcluster deployment you specified in `TASKCLUSTER_ROOT_URL`.

If your changes require updating API or graphQL resolvers, you can start the services locally using `docker`:

```sh
# from the root project directory
# this will pull latest images if they are not available and start containers in development mode
yarn start
# start few services in development mode to be able to make changes to the services
yarn dev:start queue-web web-server-web
```

Please check the instructions on how to run the [development mode](#development-mode) for more details.

  Please be aware that running all services locally will take a lot of resources and will be slower than running the UI against a remote Taskcluster deployment.

Now you should be able to run the UI with services locally:

```sh
cd ui
export TASKCLUSTER_ROOT_URL=http://localhost:5080
yarn start
```

## Hacking on the UI (old approach)

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

Generation requires database to be running in order to properly generate schema migrations. You can start it using `docker compose`:

```sh
# start the database and initialize it
docker compose up -d postgres pg_init_db

# export test database that can be used for generation
export TEST_DB_URL=postgresql://postgres@localhost:5432/taskcluster-test

yarn generate
```

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
  command: node services/queue/src/main.js expire-artifacts
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

## Running everything locally using `docker compose`

> Note: you'll need recent version of `docker` with [`docker-compose-plugin`](https://docs.docker.com/compose/install/linux/) |(or alternatively [docker-compose](https://github.com/docker/compose/releases))
>
> For non-linux systems it is advised to run docker with at least 4 CPU cores and at least 6 GB of memory.

It is possible to run all web services locally using `docker compose`.

[`docker-compose.yml`](../docker-compose.yml) is being autogenerated with `yarn generate`

It defines dependencies: `postgres`, `rabbitmq`, `localstack` (for S3 artifacts) and all web services.

User names and passwords can be seen in [`docker-compose.yml`](../docker-compose.yml).

```shell
# to run all containers
yarn start

# to stop them
yarn stop

# to run only some
docker compose up -d auth-web

# to run any task from entrypoint
docker compose run --rm auth-web worker-manager/expire-workers
```

**Database** would be initiated with the help of [`docker/postgres/init.sql`](../docker/postgres/init.sql) script and `pg_init_db` service which runs migrations.

**Localstack** (S3) will provision two buckets on first start: `public-bucket`, `private-bucket`. Buckets would be removed and recreated on each restart. If you need to persist buckets please override `s3_init_buckets` command.

All services are served through the `taskcluster` service which uses [`docker/nginx.conf`](../docker/nginx.conf).
UI can be accessed through [http://taskcluster](http://taskcluster) (or [http://localhost](http://localhost)).

To avoid having HAWK authentication issues and be able to see worker logs, modification of `/etc/hosts` is necessary with this entry:

```
127.0.0.1 taskcluster
```

To login, use `static/taskcluster/*` client ids and access tokens that can be seen in `AUTH_WEB` environment variable of `auth-web` service.

> Warning: on linux systems please check that your environment variables `TASKCLUSTER_ROOT_URL`, `TASKCLUSTER_CLIENT_ID` and `TASKCLUSTER_ACCESS_TOKEN` do not interfere.
> Docker will use those envs to overwrite generated ones, which might break some functionality.

### Development mode

Running docker compose with `docker-compose.dev.yml` allows local development in containers without necessity of restarting them.
Changes in source code will be applied immediately.

This is achieved with the help of mounting source code from host to the container, and using `nodemon` for core services and `webpack-dev-server` for `ui`.

It might take longer for `ui` service to start, as it needs to compile application. After that reloads would be fast.

```sh
# run ALL containers with local source code mounts as volumes
yarn dev:start

# stop
yarn dev:stop
```

> Note: starting all services in developer mode might be slower and will require extra resources. As alternative you can only start some of the services in development mode:

```sh
# first run everything
yarn start

# then start some of the services you want to develop
yarn dev:start queue-web auth-web

# now queue-web and auth-web are started with nodemon and will be live-reloaded when source file will change

# to stop everything
yarn stop
```

### Using compose profiles

By default `yarn start` (`docker compose up`) will only start web services and workers. Background tasks and cron jobs do not start with the rest of the services.

If you need to run those services you can use [profiles](https://docs.docker.com/compose/profiles/) functionality of `docker compose`.

Each background and cron job have special profiles defined for them (see `docker-compose.yml`):

* service name (`queue`, `github`, ...)
* job type (`background`, `cron`)
* service + job type (`queue-cron`, `worker-manager-background`, ...)

That can help to run only what is needed:

```sh
# start all services + all queue background and cron jobs
export COMPOSE_PROFILES=queue
yarn start
# stop all
yarn stop

# start all services + all cron jobs in development mode
export COMPOSE_PROFILES=cron
yarn dev:start
# stop all
yarn dev:stop

# start all services + background tasks of worker-manager
export COMPOSE_PROFILES=worker-manager-background
yarn start
# stop all
yarn stop

# start only one specific background job by name
yarn start notify-background-handler
```

> Note: although `docker compose` command allows passing profile names through arguments like `docker compose --profile cron up -d`, those services will not be stopped if you run `docker compose down` afterwards. To stop them you would need to use same arguments `docker compose --profile cron down`.
>
> This way using exported environment variable makes compose behaviour more intuitive.

## Cleaning up unused docker images

With each new Taskcluster release, new docker images are created. Over time this may lead to a large number of unused images. To clean up unused images, run the following command:

```sh
./docker/cleanup-images.sh
```

This will find all `taskcluster/` images that are referenced in `docker-compose.yml` and for each one will remove all other images with the same name but different tag.

## Running tasks with local generic-worker

`generic-worker` is configured to automatically start with `docker compose` and connect to taskcluster using `docker-compose/generic-worker` task queue id.

It is possible to create a task in the UI using similar payload:

```yml
taskQueueId: docker-compose/generic-worker
...
payload:
  command:
    - - ls
  maxRunTime: 60
...
```

## Debugging Github integration locally

Please refer to the [Github integration manual](https://docs.taskcluster.net/docs/manual/deploying/github) on how to set it up initially.

Github integration relies on webhook events that will be sent to the endpoint defined in your Github application settings.
To be able to test it locally, you'd need to setup a tunnel, so those API calls will reach your dev env.

### Using ngrok to forward webhook events

You can use <https://ngrok.com/> for this purpose:

1. Sign up for a free account (doesn't work otherwise)
2. Download and install ngrok
3. `ngrok config add-authtoken <token>` (found on the [settings page](https://dashboard.ngrok.com/get-started/setup)
4. Start it using `ngrok http --host-header=taskcluster taskcluster:80`
5. Copy the forwarding url and use it for the Github Application settings:
   * Callback URL: `https://your-unique-subdomain.ngrok.io`
   * Webhook URL: `https://your-unique-subdomain.ngrok.io/api/github/v1/github`
6. Use web interface <http://127.0.0.1:4040/> to inspect incoming webhooks

### Start github services in development mode

Make sure you configure github services in docker compose properly. For this you will need to override following environment variables in your `docker-compose.override.yml`:

```yml
# Make sure to replace all values if you want to use the code below
services:
  github-web:
    environment: &ref1
      - GITHUB_PRIVATE_PEM="-----BEGIN RSA PRIVATE KEY-----\n<private key>\n-----END RSA PRIVATE KEY-----\n"
      - GITHUB_APP_ID=<application id>
      - WEBHOOK_SECRET=<secret or blank>
      - LEVEL=debug
      - DEBUG=*
  github-background-worker:
    environment: *ref1
```

```sh
# start everything
yarn start

# start github api handler and background worker in development mode
yarn dev:start github-web github-background-worker

# follow logs
docker compose logs -f github-web github-background-worker
```

### Connect to your test repository

You can use any existing repository or create a new one. Install the application you've configured before to that repository.

In order for Taskcluster to start doing something you need to create `.taskclster.yml` in the root of that repository, in the main branch. You can refer to the <http://taskcluster/quickstart> page to see how this file should look like.

<details>
<summary>Example of `.taskcluster.yml`</summary>

```yml
version: 1
reporting: checks-v1
policy:
  pullRequests: collaborators
tasks:
  - $if: 'tasks_for == "github-push"'
    then:
      taskQueueId: docker-compose/generic-worker
      schedulerId: taskcluster-ui
      created: {$fromNow: ''}
      deadline: {$fromNow: '1 day'}
      payload:
        command:
          - - /bin/bash
            - '-c'
            - echo "github-push"; exit 0
        maxRunTime: 30
      metadata:
        name: example-task
        description: An **example** task
        owner: username@domain.tld
        source: http://taskcluster/tasks/create
    else:
      $if: 'tasks_for == "github-pull-request"'
      then:
        taskQueueId: docker-compose/generic-worker
        schedulerId: taskcluster-ui
        created: {$fromNow: ''}
        deadline: {$fromNow: '1 day'}
        payload:
          command:
            - - /bin/bash
              - '-c'
              - echo "github-pull-request"; exit 0
          maxRunTime: 30
        metadata:
          name: example-task
          description: An **example** task
          owner: username@domain.tld
          source: http://taskcluster/tasks/create
```

</details>

After this, if you push something or create a pull request, you will start receiving webhook events.

However, `static/taskcluster/github` client will not be able to create tasks at this point, since it misses some scopes. For this you will need to visit <http://taskcluster/auth/roles> page and create new role with name that matches: `repo:github.com/<org>/<name>:*`. (see [documentation](https://docs.taskcluster.net/docs/reference/integrations/github/checks#taskcluster-github-checks))

It should allow calling queue service, and for the local environment the list of scopes can look like:

```yml
queue:create-task:*
queue:route:checks
queue:scheduler-id:*
queue:rerun-task:*
```
