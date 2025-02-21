import os
import json

from taskgraph.transforms.base import TransformSequence

transforms = TransformSequence()


def _dependency_versions():
    pg_version = 15
    with open('clients/client-rust/rust-toolchain', 'r') as f:
        rust_version = f.read().strip()
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
        env["TASKCLUSTER_PULL_REQUEST_NUMBER"] = os.environ.get("TASKCLUSTER_PULL_REQUEST_NUMBER", "")

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

        # We want to set this everywhere other than lib-testing
        if task["name"] != "testing":
            env["NO_TEST_SKIP"] = "true"
        yield task


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
