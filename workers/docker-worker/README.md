# Docker Worker

Docker task host for linux.

Each task is evaluated in an restricted docker container.
Docker has a bunch of awesome utilities for making this work well...
Since the images are COW running any number of task hosts is plausible
and we can manage their overall usage.

We manipulate the docker hosts through the use of the [docker remote
api](https://docs.docker.com/engine/api/v1.24/)

See the [doc site](/docs/workers/docker-worker/index.html)
for how to use the worker from an existing `worker-type` the docs here
are for hacking on the worker itself.

## Requirements

  - Node (same version as the rest of Taskcluster)
  - Docker

## Usage

```
# from the root of this repo) also see --help
node bin/worker.js <config>
```

### Configuration

The [defaults](config.yml) contains all configuration options
for the docker worker in particular these are important:

  - `rootUrl` the rootUrl of the taskcluster instance to run against

  - `taskcluster` the credentials needed to authenticate all pull jobs
    from taskcluster.

### Directory Structure

  - [src/main.js - primary entrypoint for worker](src/main.js)
  - [src - source of internal worker apis](src)
  - [src/task_listener.js - primary entrypoint of worker](src/task_listener.js)
  - [src/task.js - handler for individual tasks](src/task_listener.js)
  - [src/features/ - individual features for worker](src/features/)

### Environment

docker-worker runs in an Ubuntu environment with various packages and kernel modules
installed.

Within the root of the repo is a Vagrantfile and vagrant.sh script that simplifies
creating a local environment that mimics the one uses in production.  This environment
allows one to not only run the worker tests but also to run images used in Taskcluster
in an environment similar to production without needing to configure special things
on the host.

#### Loopback Devices

The v4l2loopback and snd-aloop kernel modules are installed to allow loopback audio/video
devices to be available within tasks that require them.  For information on how to
configure these modules like production, consult the
[vagrant script](docker-worker/vagrant.sh)
used for creating a local environment.

## Running tests

There are a few components that must be configured for the tests to work properly
(e.g. docker, kernel modules, and other packages). A Vagrant environment is
available to make this easy to use. Alternatively, it is possible to run tests
outside of Vagrant. But this requires a bit more effort.

### Setting up vagrant (recommended)

1. Install [VirtualBox](https://www.virtualbox.org/)
2. Install [Vagrant](https://www.vagrantup.com/)
3. Install vagrant-reload by running `vagrant plugin install vagrant-reload`
4. Within the root of the repo, run `vagrant up`
5. `vagrant ssh` to enter the virtual machine

### Setting up a standalone vm (non-Vagrant users)

If you can't use Vagrant (e.g. you are using Hyper-V and can't use Virtualbox),
it is possible to configure a bare virtual machine in a very similar manner to
what Vagrant would produce.

1. Create a new virtual machine.
2. Download and boot an Ubuntu 14.04 server ISO
3. Boot the VM
4. Click through the Ubuntu installer dialogs
5. For the primary username, use `vagrant`
6. All other settings can pretty much be the defaults. You'll just
   press ENTER a bunch of times during the install wizard. Although
   you'll probably want to install `OpenSSH server` on the
   `Software selection` screen so you can SSH into your VM.
7. On first boot, run `sudo visudo` and modify the end of the `%sudo` line
   so it contains `NOPASSWD:ALL` instead of just `ALL`. This allows you
   to `sudo` without typing a password.
8. `apt-get install git`
9. `git clone https://github.com/taskcluster/taskcluster ~/taskcluster`
10. `sudo ln -s /home/vagrant/taskcluster/workers/docker-worker /vagrant`
11. `sudo ln -s /home/vagrant/taskcluster/workers/docker-worker /worker`
12. `cd taskcluster/workers/docker-worker`
13. `./vagrant.sh` -- this will provision the VM by installing a bunch of
    packages and dependencies.
14. `sudo reboot` -- this is necessary to activate the updated kernel.
15. `sudo depmod`

#### Logging into virtual machine and configuring environment

Many tests require the `TASKCLUSTER_ROOT_URL`, `TASKCLUSTER_ACCESS_TOKEN`, and `TASKCLUSTER_CLIENT_ID`
environment variables. These variables
define credentials used to connect to external services.

To obtain Taskcluster client credentials, run
`eval $(cat scopes.txt | xargs taskcluster signin)`. This will open a web
browser and you'll be prompted to log into Taskcluster. This command requires
the `taskcluster` cli. This can be downloaded for your OS/architecture (name `taskcluster-<OS>-<ARCH>`) from the following page. Be sure to rename the download to `taskcluster` (linux/darwin) or `taskcluster.exe` (windows):

https://github.com/taskcluster/taskcluster/releases.

If using Vagrant, setting these environment variables in the shell used
to run `vagrant ssh` will cause the variables to get inherited inside the
Vagrant VM. If not using Vagrant, you should add `export VAR=value` lines
to /home/vagrant/.bash_profile.

From the virtual machine, you'll need to install some application-level
dependencies:

1. `cd /vagrant`
2. `./build.sh` -- builds some Docker images
3. `yarn install --immutable` -- installs Node modules

#### Running Tests

Like most node projects, `yarn test` will run the docker-worker tests.
In the default case, this will end up skipping most tests.
Most of the time, this is OK: if your change is covered by the tests that are not skipped, then it is fine to submit a PR without running the remainder of the tests.

Most tests are skipped because they require Docker.
If you have Docker installed, set `DOCKER_TESTS=1` to run these tests: `DOCKER_TESTS=1 yarn test`.
Note that the tests will be merciless with your Docker environment -- do not enable this if you have images or containers that you cannot afford to lose!

Other tests are disabled because they require Taskcluster credentials for the https://community-tc.services.mozilla.com/ deployment.
These credentials can be acquired, if you have the permission, by running `TASKCLUSTER_ROOT_URL=https://community-tc.services.mozilla.com taskcluster signin  --scope assume:project:taskcluster:docker-worker-tester --name d-w`.
This will set some environment variables that will be detected by the test suite.

Under most circumstances one only wants to run a single test suite.
For individual test files, run `./node_modules/mocha/bin/mocha --bail test/<file>`.
To run tests within a test file, add `--grep <phrase>` when running the above command to capture just the individual test name.

*** Note: Sometimes things don't go as planned and tests will hang until
they timeout. To get more insight into what went wrong, set "DEBUG=*" when
running the tests to get more detailed output. ***

### Common problems

  - Time synchronization : if you're running docker in a VM your VM may
    drift in time... This often results in stale warnings on the queue.
