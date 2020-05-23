import os
import json

from taskgraph.transforms.base import TransformSequence

transforms = TransformSequence()


def _dependency_versions():
    with open('package.json', 'r') as pkg:
        with open('.go-version', 'r') as goversion:
            node_version = json.load(pkg)["engines"]["node"].strip()
            go_version = goversion.read().strip()
            pg_version = 11
            return (node_version, go_version, pg_version)


@transforms.add
def taskcluster_images(config, jobs):
    node_version, go_version, pg_version = _dependency_versions()
    for job in jobs:
        image = job["worker"]["docker-image"]
        if isinstance(image, dict) and image.keys()[0] == "taskcluster":
            repo = image["taskcluster"]
            if (repo == "node-and-go"):
                image = "taskcluster/node-and-go:node{node_version}-{go_version}"
            elif (repo == "node-and-postgres"):
                image = "taskcluster/node-and-postgres:node{node_version}-pg{pg_version}"
            elif (repo == "browser-test"):
                image = "taskcluster/browser-test:{node_version}"
            elif (repo == "rabbit-test"):
                image = "taskcluster/rabbit-test:{node_version}"
            elif (repo == "worker-ci"):
                image = "taskcluster/worker-ci:node{node_version}"

            job["worker"]["docker-image"] = image.format(
                node_version=node_version,
                go_version=go_version,
                pg_version=pg_version
            ).strip()

        yield job


@transforms.add
def add_task_env(config, jobs):
    node_version, go_version, pg_version = _dependency_versions()
    for job in jobs:
        env = job["worker"].setdefault("env", {})

        # These are for the way docker-worker wants them
        env["GITHUB_REPO_URL"] = config.params["head_repository"]
        env["GITHUB_BRANCH"] = config.params["head_ref"]
        env["GITHUB_SHA"] = config.params["head_rev"]

        # These are for the way codecov wants them
        env["CI_BUILD_URL"] = "{}/tasks/{}".format(os.environ.get("TASKCLUSTER_ROOT_URL"), os.environ.get("TASK_ID"))
        env["GIT_BRANCH"] = config.params["head_ref"]

        # Passing through some things the decision task wants to child tasks
        env["TASKCLUSTER_PULL_REQUEST_NUMBER"] = os.environ.get("TASKCLUSTER_PULL_REQUEST_NUMBER", "")

        # Make dependency versions available for use
        env["NODE_VERSION"] = node_version
        env["GO_VERSION"] = go_version
        env["GO_RELEASE"] = go_version[2:]  # Just strip the `go` prefix
        env["POSTGRES_VERSION"] = str(pg_version)

        # We want to set this everywhere other than lib-testing
        if job["name"] != "testing":
            env["NO_TEST_SKIP"] = "true"
        yield job


@transforms.add
def direct_dependencies(config, jobs):
    for job in jobs:
        job.setdefault("soft-dependencies", [])
        job["soft-dependencies"] += [task.label for task in config.kind_dependencies_tasks]
        yield job


@transforms.add
def parameterize_mounts(config, jobs):
    node_version, go_version, pg_version = _dependency_versions()
    for job in jobs:
        mounts = job.get("worker", {}).get("mounts")
        if mounts:
            for mount in mounts:
                if mount["content"].get("url"):
                    mount["content"]["url"] = mount["content"]["url"].format(
                            go_version=go_version,
                            node_version=node_version)
                if mount.get("directory"):
                    mount["directory"] = mount["directory"].format(
                            go_version=go_version,
                            node_version=node_version)
        yield job
