UNTRUSTED_PULL_REQUEST = "github-pull-request-untrusted"
RUN_WITHOUT_SECRETS = "run-without-secrets"

PR_DOCKER_IMAGE_INDEX = "taskcluster.cache.pr.docker-images."

UNTRUSTED_TASK_EXPIRY = "28 days"

RELEASE_DEADLINE = "4 days"
RELEASE_NOTIFY = "notify.email.taskcluster-notifications@mozilla.com"
# Each release task reads one secret, RELEASE_SECRET_PREFIX/<name> (the staging
# prefix on staging releases), named by its `release-secret` key. Staging tasks
# only read the secrets listed here: staging image pushes go to a scratch
# registry, PyPI and crates.io are dry runs, and Homebrew is not updated.
RELEASE_SECRET_PREFIX = "project/taskcluster/release"
STAGING_RELEASE_SECRET_PREFIX = "project/taskcluster/staging-release"
RELEASE_SECRETS = {"github", "docker-hub", "pypi", "crates-io"}
STAGING_RELEASE_SECRETS = {"github"}
