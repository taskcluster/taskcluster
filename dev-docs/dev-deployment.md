# Development Deployments

_NOTE:_ You probably do not need a dev deployment!
Dev deployments are useful for manually testing high-level functionality in a realistic situation.
As a rule, Taskcluster's built-in automated tests are sufficient, and should be kept up-to-date with any changes.
Manual testing of changes is not sufficient, and not required to merge a change.
Moreover, dev deployments are difficult and consume substantial resources.

## Prerequisites

You will need to have the following

* A running kubernetes cluster with at least 2000 mCPU and 4GB RAM available.
  * Helm 3 installed
  * The latest version of kubectl installed, and credentials configured to talk to the cluster
* A RabbitMQ cluster running the latest available version.
* A Postgres server running Postgres 11.x (see below for Google Cloud SQL, or use another provider).
  The Postgres server must be initialized with the `en_US.utf8` locale; see [the deployment docs](../ui/docs/manual/deploying/database.mdx).
* An AWS account and an IAM user in that account
  Set up your `aws` command-line to use the IAM user (`aws configure`).
  The user must be able to configure S3 and IAM resources.
  It's safe to use a root or admin account for this, as it is just used to create new IAM users wihch will be used by the Taskcluster deployment.
* A hostname for which you control DNS.
  Your deployments "root URL" will be `https://<hostname>`.

TODO: how to set up an IP and cert for a non-GKE deployment

You should also familiarize yourself with [the deployment docs](../ui/docs/manual/deploying/database.mdx).

### Google Kubernetes

For GKE, set up a Kubernetes cluster and then run `gcloud container clusters get-credentials` locally to set up `kubectl`.

Set up an IP for your deployment:

1. Set up an IP address: `gcloud compute addresses create <yourname>-ingress-ip --global`.
   You can find the assigned IP in `gcloud compute addresses list`, and put it into DNS as an A record.
1. Create a certificate: `certbot certonly --manual --preferred-challenges dns`.  This will ask you to add a TXT record to the DNS.
   Note that certbot is installed with `brew install letsencrypt` on macOS.
1. Upload the certificate: `gcloud compute ssl-certificates create <yourname>-ingress --certificate <path-to-fullchain.pem> --private-key <path-to-key>`. When the time comes to renew the certificate, simply increment the name (e.g., <yourname>-ingress-1). 

### Minikube

If you want to run taskcluster on a kubernetes cluster on a server or virtual machine, minikube can be used.
Follow the regular installation for minikube, however:

1. Make sure to deploy a kubernetes cluster with at least 2 CPUs and 4GB of memory.
2. Enable the nginx ingress on the minikube cluster.

#### SSL through a reverse proxy

In order to not have to fiddle with secrets for the nginx ingress, you can alternatively put apache2 or nginx on the host, and then having this act as a reverse proxy. Point it at port 80 (HTTP) of the ingress that is created once you deployed taskcluster.

Example configuration with SSL on the reverse proxy:

```
<VirtualHost *:80>
    RewriteEngine On
    RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]
</VirtualHost>

<VirtualHost *:443>
   ServerName <subdomain>.<domain>.<tld> # example: taskcluster.example.com
   SSLEngine on
   SSLProxyEngine on
   SSLProtocol             all -SSLv3 -TLSv1 -TLSv1.1
   SSLCertificateFile      /etc/letsencrypt/live/<domain>/fullchain.pem # Or when not using letsencrypt, the path to your cert + CA chain.
   SSLCertificateKeyFile   /etc/letsencrypt/live/<domain>/privkey.pem # Or when not using letsencrypt, the path to your certificate's private key.

   # HTTP Strict Transport Security (mod_headers is required) (63072000 seconds)
   Header always set Strict-Transport-Security "max-age=63072000"
   ProxyPass / https://x.x.x.x/ nocanon # Replace with the ingress IP of your taskcluster deployment. kubectl get ingress
   ProxyPassReverse / https://x.x.x.x/ # Replace with the ingress IP of your taskcluster deployment. kubectl get ingress
   ProxyPreserveHost on
   SSLProxyCheckPeerCN off # Required when not using a trusted SSL cert (when not changing the ingress SSL cert)
   AllowEncodedSlashes on
</VirtualHost>
```

#### Troubleshooting:
* Certbot error `[Errno 13] Permission denied: '/var/log/letsencrypt' Either run as root, or set --config-dir, --work-dir, and --logs-dir to writeable paths.` - do not run as root, but set the directories instead.

__NOTE:__ be sure to point the reverse proxy at the ingress IP using HTTPS and preserving the host, ignore SSL validation if needed (of the ingress)

#### SSL certificate from LetsEncrypt

LetsEncrypt  provides free SSL certificates for publically accessable websites. [Certbot](https://certbot.eff.org/) is a popular option to request, and depending on the webserver automatically deploy and renew SSL certificates.

#### Secure SSL configuration for apache/gninx

For a secure SSL configuration for your webserver, [Mozilla's SSL Configuration](https://ssl-config.mozilla.org/) tool provides with multiple secure configurations for multiple webservers.

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

### taskcluster-dev.net hostnames

For those working on the project full-time, we can create a subdomain of `taskcluster-dev.net`.
This is controlled by the Route53 zone in the `taskcluster-aws-staging` AWS account.
Someone with access to that account will need to create the A record, and add any other records required to validate the domain for LetsEncrypt.

## Verify

This section uses `yarn dev:init` to automatically set up the various things Taskcluster requires.
This includes users on the RabbitMQ and Postgres cluster, AWS resources, and so on.
It creates and updates a file named `dev-config.yml` in the root of the repository.

To run `yarn dev:..` commands, you'll need to install the node dependencies, as described in [development-process](development-process.md).

1. `yarn dev:init` will ask you a bunch of questions and fill out your local config for you (most of it anyway).
   Once it has done this, your `dev-config.yml` is filled with secrets so don't leak it.
   These are dev-only secrets though so don't be too worried.
   Once this command has completed successfully, you can edit `dev-config.yml` to suit yourself.
1. Run `yarn dev:verify` and see if it complains about any missing values in your configuration.
   If any are missing or incorrect, fix them in `dev-config.yml` and try again.
   Please file issues for any fields that `yarn dev:init` missed or got wrong.

### Troubleshooting

* Dev config creation step: `AccessDenied: Access Denied` error with a stack trace pointing at aws-sdk library - make sure to have your aws credentials are fetched and stored in environment variables AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_SESSION_TOKEN.
* Helm error `Error: stat taskcluster: no such file or directory` - make sure you have helm3 installed.
* Kubectl error: `Error: unknown flag --current` - make sure you run kubectl v1.15.0 or later

## Apply

Until now, nothing has been deployed into the Kubernetes cluster.

1. Run `yarn dev:db:upgrade` to upgrade the DB to the current version of the database.
   You will generally want to do this before deploying with `dev:apply`, if any DB changes need to be applied.
   This command is a thin wrapper around `yarn db:upgrade` that sets the necessary environment variables, so feel free to use that command instead if you prefer.
1. `yarn dev:apply` will use helm+kubectl to apply all of your kubernetes resources to the cluster.
   *Note that this will create a new namespace in the cluster for you and switch your kubectl context to it*.
   If you make changes to `dev-config.yml`, just apply again. It should change anything you've changed and remove anything you've removed.

If you need it, `yarn dev:delete` will uninstall your deployment.

## Test It Out!

Your deployment is up and running.
Have a look at the root URL -- it should load the Taskcluster UI.
Other URLs such as `/references/` or `/api/queue/v1/ping` should also do interesting things.

Have a look at the set of running deployments (`kubectl get deployments`) to see what is running, or what has failed.
Note that the `taskcluster-github` service will not work yet -- see below to set that up, or configure it to not run (set `github.procs.web.replicas` to 0, and the same for its other deployments).

### Deploying a Local Build

If you want to deploy local changes, run `yarn build --push` and add the resulting image id to your config file with the key `dockerImage`.
If you don't have permission to push to the Docker repository, you can push the image elsewhere manually.

## Setting up a Taskcluster Github app in your Development Cluster

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
3. Set `webhook_secret` in your `dev-config.yml` to whatever it is set to in the app if you have it enabled.
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

## Publishing Pulse Messages in Your Development Cluster

If you set up a taskcluster-github app, you probably want to test a variety of its functionality. So you might need to impersonate a worker (of course, you can also set up an actual worker, but if workers are not what you are trying to test, that might be an overkill). There might be other uses for this as well, as Taskcluster services communicate with each other via pulse messages, so any integration testing would need this.
1. In your `dev-config.yml`, look up `pulseHostname` and `meta.rabbitAdminUser`. In the passwordstore, get the password for that user.
2. Put together a body of your pulse message. Make sure you use the schemas. It should be in JSON format.
3. Look up the routing key and exchange you need (most likely you are testing a handler - so look up the bindings for that handler in the code).
3. Navigate to the management UI on the RabbitMQ server (the url from `pulseHostname`), login using the above credentials and go to the exchange of interest. You will see *Publish Message* section in the UI. Fill out the *Routing Key* and *Payload* fields (the result of the step 2 goes into the latter). Press *Publish Message* and you're done.

