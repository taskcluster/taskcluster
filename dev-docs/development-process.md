# Development Process

Welcome to Taskcluster development!

Taskcluster is composed of a bunch of microservices, some libraries, the React user interface, some client libraries, and a bunch of infrastructure to glue it all together.
You will probably be working on only one of these pieces, so read carefully below to see what you need to do.

## Setup

### Node

<!-- the next line is automatically edited; do not change -->
You will need Node version 10.16.3 installed.
We recommend using https://github.com/nvm-sh/nvm to support installing multiple Node versions.

### Go

<!-- the next line is automatically edited; do not change -->
Go version go1.12.9 is required for some development tasks, in particular to run `yarn generate`.
For new contributors not familiar with Go, it's probably safe to skip installing Go for now -- you will see a helpful error if and when it is needed.
We recommend using https://github.com/moovweb/gvm to support installing multiple Go versions.

### Dependency Installation

To set up the repository, run `yarn` in the root directory.
This will install all required dependencies from the Yarn registry.

For some of the commands below, such as `mocha`, you will need to make sure that `node_modules/.bin` is in your PATH.
To set this up, in the root directory, run

```sh
export PATH=$PWD/node_modules/.bin:$PATH
```

## Hacking on the UI

The files comprising the Taskcluster UI are under [`ui/`](../ui).
It relies on a microservice called web-server, which you will need to run in a different terminal window.
To run the Taskcluster UI:

* In a shell window for taskcluster-web-server:
  * Set `TASKCLUSTER_ROOT_URL` to point to a Taskcluster deployment you wish to represent in the UI.
    For example:

    ```sh
    export TASKCLUSTER_ROOT_URL=https://taskcluster-staging.net
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
Unless you provide additional credentials, lots of tests will be skipped.
Many of these are *duplicate* runs of tests, labeled "real" and "mock".

For most changes, the mock tests are sufficient to detect errors.
To be sure, follow the TDD practice of writing your tests first, ensuring that they fail before you fix the bug or add the feature.
If your new test is skipped, then consult with one of the Taskcluster team members to see how you can get some credentials.

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
  command: node src/main expire-artifacts
```

To run this process locally:
```sh
NODE_ENV=development node src/main expire-artifacts
```

You may need to provide additional configuration, either as environment variables or in `user-config.yml`.
You can find a template for `user-config.yml` in `user-config-example.yml`: just copy the latter to the former and edit it.

## Running Services in a Development Cluster

You will first need to have

* a running kubernetes cluster (at the moment this has to be a gke cluster from google)
* a rabbitmq cluster
* an azure account
* an aws account and an IAM user in that account
* helm installed (either 2 or 3 should Just Work)
* latest version of kubectl installed

Once those are all set up, you will need:

* Configure CLI access for your AWS user; this iam user must be able to configure s3/iam resources
* Think of a hostname for which you control the DNS; this will be your rootUrl. (hint: <yourname>.taskcluster-dev.net - this domain managed in Route53 in the taskcluster-aws-staging AWS account. You'll have to create a TXT recordset named _acme-challenge.<yourname>.taskcluster-dev.net with the secret that certbot gave you, and after completing the certbot step - IPv4 recordset with your ingress-ip)
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
   be encryped at rest.
   * SubscriptionId can be found in the Azure console
   * RabbitMQ account creds are in passwordstore at tc/cloudamqp.com/hip-macaw
1. Run `yarn dev:verify` and see if it complains about any missing values in
   your configuration
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

### Optional configuration

You can add a `errorConfig` to the top-level of your config containing

```
errorConfig:
  reporter: SentryReporter
  dsn: ...
```

in order to report your errors to a sentry project.

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
