import os
import json
import tomllib

from taskgraph.transforms.base import TransformSequence

from taskgraph.transforms.task import transforms as task_transforms

from ..constants import (
    PR_DOCKER_IMAGE_INDEX,
    RUN_WITHOUT_SECRETS,
    UNTRUSTED_PULL_REQUEST,
    UNTRUSTED_TASK_EXPIRY,
)
from ..scopes import is_secret_scope

transforms = TransformSequence()


def _dependency_versions():
    pg_version = 15
    with open('clients/client-rust/rust-toolchain.toml', 'r') as f:
        rust_version = tomllib.loads(f.read())["toolchain"]["channel"].strip()
    with open('package.json', 'r') as pkg:
        node_version = json.load(pkg)["engines"]["node"].strip()
    with open('.go-version', 'r') as goversion:
        go_version = goversion.read().strip()
    with open('.golangci-lint-version', 'r') as golangcilintversion:
        golangci_lint_version = golangcilintversion.read().strip()
    return (node_version, go_version, golangci_lint_version, rust_version, pg_version)


@transforms.add
def taskcluster_image_versions(config, tasks):
    node_version, go_version, _, rust_version, pg_version = _dependency_versions()
    for task in tasks:
        image = task["worker"]["docker-image"]
        if isinstance(image, str):
            task["worker"]["docker-image"] = image.format(
                node_version=node_version,
                go_version=go_version[2:],
                rust_version=rust_version,
                pg_version=pg_version
            ).strip()

        yield task


@transforms.add
def add_task_env(config, tasks):
    node_version, go_version, golangci_lint_version, rust_version, pg_version = _dependency_versions()
    for task in tasks:
        env = task["worker"].setdefault("env", {})

        # These are for the way docker-worker wants them
        env["GITHUB_REPO_URL"] = config.params["head_repository"]
        env["GITHUB_BRANCH"] = config.params["head_ref"]
        env["GITHUB_SHA"] = config.params["head_rev"]

        # These were for codecov, but are handy to see anyway
        env["CI_BUILD_URL"] = "{}/tasks/{}".format(os.environ.get("TASKCLUSTER_ROOT_URL"), os.environ.get("TASK_ID"))
        env["GIT_BRANCH"] = config.params["head_ref"]

        # Passing through some things the decision task wants to child tasks
        env["TASKCLUSTER_PULL_REQUEST_URL"] = os.environ.get("TASKCLUSTER_PULL_REQUEST_URL", "")

        # Make dependency versions available for use
        env["NODE_VERSION"] = node_version
        env["GO_VERSION"] = go_version
        env["GO_RELEASE"] = go_version[2:]  # Just strip the `go` prefix
        env["GOLANGCI_LINT_VERSION"] = golangci_lint_version
        env["RUST_VERSION"] = rust_version
        env["POSTGRES_VERSION"] = str(pg_version)

        # Things that g-w decision task wants
        # The default here is to allow local running of taskgraph generation
        env["TASK_GROUP_ID"] = os.environ.get("TASK_ID", "")
        env["GITHUB_CLONE_URL"] = config.params["head_repository"]

        # Dependabot PRs can saturate contended worker pools (e.g. macOS) and delay
        # human work, so lower the priority of every task they generate.
        if config.params["head_ref"].startswith("dependabot/"):
            task["priority"] = "low"

        yield task


def configure_task(config, tasks):
    """Enforce test dependencies and isolate untrusted tasks."""
    is_untrusted_pull_request = config.params["tasks_for"] == UNTRUSTED_PULL_REQUEST

    for task in tasks:
        worker = task.get("worker")

        # Require every non-secret dependency to be present on both trusted and
        # untrusted tasks. Secret-specific test helpers recognize the flag below.
        # Workerless tasks, such as built-in/succeed, have no payload
        # environment and must not acquire one implicitly.
        if worker is not None and task.get("label") != "library-testing":
            worker.setdefault("env", {})["NO_TEST_SKIP"] = "true"

        if is_untrusted_pull_request:
            task["expires-after"] = UNTRUSTED_TASK_EXPIRY

            # The restricted Community-TC role is the security boundary. This
            # only makes explicitly secret-optional tasks creatable by that role.
            if task.get("attributes", {}).get(RUN_WITHOUT_SECRETS):
                task["scopes"] = [
                    scope for scope in task.get("scopes", [])
                    if not is_secret_scope(scope)
                ]
                # Only secret-stripped tasks may treat NO_TEST_SKIP as
                # advisory, and only for the tests that need the secrets.
                if worker is not None:
                    worker.setdefault("env", {})["TASKCLUSTER_UNTRUSTED_PR"] = "true"

            # PR docker-image indexes are not level-qualified upstream, and a
            # namespace shared by all untrusted pull requests would let one
            # fork publish a poisoned image at a digest another fork then
            # consumes. Rebuild images every run instead of publishing to or
            # searching any index.
            task["routes"] = [
                route for route in task.get("routes", [])
                if PR_DOCKER_IMAGE_INDEX not in route
            ]
            optimization = task.get("optimization")
            if isinstance(optimization, dict) and "index-search" in optimization:
                del task["optimization"]

        yield task


# Untrusted isolation must hold for every kind, so a kind.yml that forgets to
# list this transform must not silently escape it. Prepend it to the shared
# task transform sequence: after each kind's run transforms (which set label
# and worker) and before the payload is built.
if configure_task not in task_transforms._transforms:
    task_transforms._transforms.insert(0, configure_task)


@transforms.add
def parameterize_mounts(config, tasks):
    node_version, go_version, golangci_lint_version, rust_version, _ = _dependency_versions()
    for task in tasks:
        mounts = task.get("worker", {}).get("mounts")
        if mounts:
            for mount in mounts:
                if "content" in mount:
                    if mount["content"].get("url"):
                        mount["content"]["url"] = mount["content"]["url"].format(
                                go_version=go_version,
                                golangci_lint_version=golangci_lint_version,
                                rust_version=rust_version,
                                node_version=node_version)
                if mount.get("directory"):
                    mount["directory"] = mount["directory"].format(
                            go_version=go_version,
                            golangci_lint_version=golangci_lint_version,
                            rust_version=rust_version,
                            node_version=node_version)
        yield task


@transforms.add
def parameterize_artifacts(config, tasks):
    node_version, go_version, golangci_lint_version, rust_version, _ = _dependency_versions()
    for task in tasks:
        artifacts = task.get("worker", {}).get("artifacts")
        if artifacts:
            for artifact in artifacts:
                artifact["path"] = artifact["path"].format(
                    go_version=go_version[2:],
                    golangci_lint_version=golangci_lint_version,
                    rust_version=rust_version,
                    node_version=node_version)
                if artifact.get("name"):
                    artifact["name"] = artifact["name"].format(
                        go_version=go_version[2:],
                        golangci_lint_version=golangci_lint_version,
                        rust_version=rust_version,
                        node_version=node_version)
        yield task


@transforms.add
def copy_command_from(config, tasks):
    to_copy = {}
    task_list = list(tasks)
    for task in task_list:
        if task.get("copy-command-from"):
            other_task = task.get("copy-command-from")
            to_copy[other_task] = None

    for task in task_list:
        if task["name"] in to_copy:
            to_copy[task["name"]] = task["run"]["command"]

    for task in task_list:
        if task.get("copy-command-from"):
            other_task = task.pop("copy-command-from")
            task["run"]["command"] = to_copy[other_task]
        yield task
