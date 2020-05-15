# Development Process

Welcome to Taskcluster development!

Taskcluster is composed of a bunch of microservices, some libraries, the React user interface, some client libraries, and a bunch of infrastructure to glue it all together.
You will probably be working on only one of these pieces, so read carefully below to see what you need to do.

## Setup

### Node

<!-- the next line is automatically edited; do not change -->
You will need Node version 12.16.3 installed.
We recommend using https://github.com/nvm-sh/nvm to support installing multiple Node versions.

### Go

<!-- the next line is automatically edited; do not change -->
Go version go1.13.7 is required for some development tasks, in particular to run `yarn generate`.
For new contributors not familiar with Go, it's probably safe to skip installing Go for now -- you will see a helpful error if and when it is needed.
We recommend using https://github.com/moovweb/gvm to support installing multiple Go versions.

### Postgres

All Taskcluster services require a Postgres 11 server to run.
The easiest and best way to do this is to use docker, but if you prefer you can install a Postgres server locally.
*NOTE* the test suites repeatedly drop the `public` schema and re-create it, effectively deleting all data in the database.
Do not run these tests against a database instance that contains any useful data!

To start the server using Docker:

```shell
docker run -ti -p 127.0.0.1:5432:5432  --rm postgres:11
```

This will run Docker in the foreground in that terminal (so you'll need to use another terminal for your work, or add the `-d` flag to daemonize the container) and make that available on TCP port 5432, the "normal" Postgres port.

However you decide to run Docker, you will need a DB URL below, as defined by [node-postgres](https://node-postgres.com/features/connecting).
For the docker container described above, this is `postgresql://postgres@localhost/postgres`.

### Node Dependency Installation

To set up the repository, run `yarn` in the root directory.
This will install all required dependencies from the Yarn registry.

For some of the commands below, such as `mocha`, you will need to make sure that `node_modules/.bin` is in your PATH.
To set this up, in the root directory, run

```sh
export PATH=$PWD/node_modules/.bin:$PATH
```

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
  * Set `TASKCLUSTER_ROOT_URL` to point to a Taskcluster deployment you wish to represent in the UI.
    For example:

    ```sh
    export TASKCLUSTER_ROOT_URL=https://community-tc.services.mozilla.com
    ```
  * Change to the `services/web-server` directory and run `yarn start`.
    This will start a web server on port 3050.
    Note that it will warn "No Pulse namespace defined".
    Unless you are working on parts of the UI that require Pulse support (and most do not), this is OK.

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

## Running Services in a Development Cluster

You will first need to have

* a running kubernetes cluster (at the moment this has to be a gke cluster from google)
* a rabbitmq cluster
* an azure account
* a postgres server (see below for Cloud SQL, or use another provider)
* an aws account and an IAM user in that account
* helm installed (either 2 or 3 should Just Work)
* latest version of kubectl installed

Once those are all set up, you will need:

* Configure CLI access for your AWS user; this iam user must be able to configure s3/iam resources
* Think of a hostname for which you control the DNS; this will be your rootUrl. (hint: <yourname>.taskcluster-dev.net - this domain managed in Route53 in the taskcluster-aws-staging AWS account. You'll have to create a TXT recordset named `_acme-challenge.<yourname>.taskcluster-dev.net` with the secret that certbot gave you, and after completing the certbot step - IPv4 recordset with your ingress-ip)
* Run `gcloud container clusters get-credentials` for your k8s cluster

Now follow along:
1. Set up an IP address: `gcloud compute addresses create <yourname>-ingress-ip --global`.
   You can find the assigned IP in `gcloud compute addresses list`, and put it into DNS as an A record.
1. Create a certificate: `certbot certonly --manual --preferred-challenges dns`.  This will ask you to add a TXT record to the DNS.
   Note that certbot is installed with `brew install letsencrypt` on macOS.
1. Upload the certificate: `gcloud compute ssl-certificates create <yourname>-ingress --certificate <path-to-fullchain.pem> --private-key <path-to-key>`
1. `yarn dev:init` will ask you a bunch of questions and fill out your local
   config for you (most of it anyway).  Once it has done this, your
   `dev-config.yml` is filled with secrets so don't leak it. These are dev-only
   secrets though so don't be too worried. Soon we may work on getting this to
   be encrypted at rest.
   * SubscriptionId can be found in the Azure console
   * RabbitMQ account creds are in passwordstore at tc/cloudamqp.com/hip-macaw
1. Run `yarn dev:db:upgrade` to upgrade the DB to the current version of the database.  You will generally want to do this
   before deploying with `dev:apply`, if any DB changes need to be applied.  This command is a thin wrapper around `yarn
   db:upgrade` that sets the necessary environment variables, so feel free to use that command instead if you prefer.
1. Run `yarn dev:verify` and see if it complains about any missing values in
   your configuration. Please note that `dev-config.yml` defines values for environment variables rather than configuration
   fields directly, so if you ever need to edit the file manually, instead of entering the names of the config fields from
   services' `config.yml` enter the names of the corresponding environment variables in lower case.
1. If you want to deploy local changes, run `yarn build --push` and add the
   resulting image id to your config file with the key `dockerImage`.
1. `yarn dev:apply` will use helm+kubectl to apply all of your kubernetes resources
   to the cluster. *Note that this will create a new namespace in the cluster
   for you and switch your kubectl context to it*. If you make changes, just apply
   again. It should change anything you've changed and remove anything you've removed.
1. `yarn dev:delete` will uninstall your deployment.

Troubleshooting:
* Certbot error `[Errno 13] Permission denied: '/var/log/letsencrypt' Either run as root, or set --config-dir, --work-dir, and --logs-dir to writeable paths.` - do not run as root, but set the directories instead.
* Dev config creation step: `AccessDenied: Access Denied` error with a stack trace pointing at aws-sdk library - make sure to have your aws credentials are fetched and stored in environment variables AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_SESSION_TOKEN.
* Helm error `Error: stat taskcluster: no such file or directory` - make sure you have helm3 installed.
* Kubectl error: `Error: unknown flag --current` - make sure you run kubectl v1.15.0 or later

### Google Cloud SQL

To set up a Google Cloud SQL server:

 1. In the Google Cloud Console, create a new SQL instance.  Its name doesn't really matter.  Generate but ignore the password for the postgres user.  It will take a while to create.
 1. Under "Connections", enable "Public IP" and allow access from your development system or wherever you'll be running DB upgrades from.  You can use 0.0.0.0/0 here, if you'd like -- Google will complain, but it's development data.
 1. Still under "Connections", enable "Private IP".
    See https://cloud.google.com/sql/docs/mysql/configure-private-ip.
    If this is the first time setting this up in a project, then you'll need to enable the Service Networking API and your account must have the "Network Administrator" role so that Cloud SQL can do some complicated networking stuff behind the scenes.
    Note that there are two buttons to click: "Allocate and Create" and then later "Save".
    Each can take several minutes.

That much only need be done once, in fact -- multiple dev environments can share the same DB.  For a specific deployment:

 1. Under "Users", create a new user with the name of your deployment (`<yourname>`) and generate a good password and make a note of it.
   * This will also be the "username prefix" from which the per-service usernames are derived
   * Google creates this user as a superuser on the server, which is a bit more than required, but will do for development environments.
 1. Under "Databases", create one with the name of your deployment (`<yourname>`).

You will need the following to tell `yarn dev:init`:
 * Public and Private IP addresses (on the "Overview" tab)
 * The admin username and password
 * The database name

### Optional configuration

You can add a `errorConfig` to the top-level of your config containing

```
errorConfig:
  reporter: SentryReporter
  dsn: ...
```

in order to report your errors to a sentry project.

### Setting up a Taskcluster Github app in your Development Cluster

You will need:
1. Development cluster up and running (see above)
2. A github app created and installed for a testing repository.

To set up a taskcluster-github app:
0. In the settings of the github app that you created, at the very bottom of the General tab, you will find Generate Private Key button. 
Press it to generate the private key.
1. In your `dev-config.yml`, in the `github` section, add `github_private_pem` - you can copy-paste the contents of the 
PEM file you have obtained in the previous step. Be careful to remove any newlines from the encrypted part,
and the necessary newlines after the header and before the footer should be replaced with `\n`, so the whole thing is a one-line string
like this: `-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEblahblahblah==\n-----END RSA PRIVATE KEY-----`
2. Populate the `github_app_id` in the `dev-config.yml` (it's the numerical `App ID` you will find in the app settings, near the top of the General tab)
3. If you have `webhook_secret` in your `dev-config.yml`, remove it.
4. In the app settings, on that same General tab, find the Webhook URL field. Enter the api URL in there (should be something like
`https://<YOUR_ROOT_URL>/api/github/v1/github`).
5. Leave the Webhook Secret field empty, make sure the app is Active and the SSL verification is enabled. On the Permissions & Events tab,
_carefully_ add permissions. Do not give it more permissions than it needs.
6. Try it on a test repo. If the app doesn't work, go into the app settings, Advanced tab, and look at the webhook deliveries.
Logs of tc-github service are also good for a few laughs.
7. If the app does work but lacks scopes, you can add those by creating a `repo:github.com/<TEST_OWNER>/<TEST_REPO>:*` role
and adding the scopes to that role.
8. If you need functional workers to go with the app, make sure to set up a provider in the cloud you need and then create a workerpool
for that provider.

### Publishing Pulse Messages in Your Development Cluster

If you set up a taskcluster-github app, you probably want to test a variety of its functionality. So you might need to impersonate a worker (of course, you can also set up an actual worker, but if workers are not what you are trying to test, that might be an overkill). There might be other uses for this as well, as Taskcluster services communicate with each other via pulse messages, so any integration testing would need this.
1. In your `dev-config.yml`, look up `pulseHostname` and `meta.rabbitAdminUser`. In the passwordstore, get the password for that user.
2. Put together a body of your pulse message. Make sure you use the schemas. It should be in JSON format.
3. Look up the routing key and exchange you need (most likely you are testing a handler - so look up the bindings for that handler in the code).
3. Navigate to the server (the url from `pulseHostname`), login using the above credentials and go to the exchange of interest. You will see *Publish Message* section in the UI. Fill out the *Routing Key* and *Payload* fields (the result of the step 2 goes into the latter). Press *Publish Message* and you're done.

## Hacking on Clients

The clients are in `clients/`.
One, `client-web`, is designed for use in web browsers, while the other, `client`, is intended for use in Node environments.
In fact, it is used by all of the services and libraries in the repository.
Note that taskcluster-ui does not use `client-web`, since it communicates with web-server via GraphQL.

Both clients contain a great deal of generated code.
Use `yarn generate`, as described above, to ensure that any changes you make are not overwritten by the code-generation system.

## Building the Taskcluster Docker Image

A Taskcluster deployment is based on a Docker image that contains all Taskcluster services, including the UI.
It's rare to use this image during development, as running the image requires lots of credentials and a special environment.

But you're welcome to build the image!
It's easy: `yarn build` in the root directory.
