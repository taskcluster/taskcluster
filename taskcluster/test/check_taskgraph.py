#!/usr/bin/env python3

import json
from pathlib import Path
import re
import subprocess
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "taskcluster"))

from src.scopes import is_secret_scope as production_is_secret_scope  # noqa: E402


PARAMETERS_DIR = Path(__file__).with_name("params")
TRUSTED_PARAMETERS = "main-repo-pull-request.yml"
UNTRUSTED_PARAMETERS = "main-repo-pull-request-untrusted.yml"

DOCKER_IMAGE_INDEX_MARKER = ".docker-images."

ALLOWED_WORKER_POOLS = {
    ("built-in", "succeed"),
    ("proj-taskcluster", "gw-ubuntu-24-04"),
    ("proj-taskcluster", "gw-ubuntu-24-04-gui"),
    ("proj-taskcluster", "gw-windows-2022"),
}

# The generic-worker test suite runs generic-worker instances as the current
# user; nothing else may add non-cache scopes to the untrusted graph.
ALLOWED_NON_CACHE_SCOPES = {
    "generic-worker:run-task-as-current-user:proj-taskcluster/gw-ubuntu-24-04-gui",
}


def taskgraph_version():
    decision_config = (REPO_ROOT / ".taskcluster.yml").read_text()
    match = re.search(r"taskgraph:decision-v([^@'\"]+)@", decision_config)
    if not match:
        raise RuntimeError("Could not find the Taskgraph version in .taskcluster.yml")
    return match.group(1)


def generate_target_graph(parameters, version):
    command = [
        "uvx",
        "--from",
        f"taskcluster-taskgraph=={version}",
        "taskgraph",
        "target-graph",
        "--root",
        "taskcluster",
        "--parameters",
        str(parameters),
        "--json",
        "--quiet",
        "--no-optimize",
    ]
    result = subprocess.run(
        command,
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def scope_text(scope):
    """Render scopes independently of the taskgraph transform helper."""
    if isinstance(scope, str):
        return scope
    if isinstance(scope, dict):
        task_reference = scope.get("task-reference")
        if isinstance(task_reference, str):
            return task_reference
        return json.dumps(scope, sort_keys=True)
    return str(scope)


def check_untrusted_graph(tasks):
    errors = []
    labels = set(tasks)

    expected_task = "go-generic-worker-insecure-untrusted"
    if expected_task not in labels:
        errors.append(f"credential-free generic-worker coverage is missing: {expected_task}")

    forbidden_tasks = {
        "generic-worker-build/test-insecure-ubuntu-24.04-amd64",
        "generic-worker-build/test-multiuser-macos-arm64",
        "generic-worker-build/test-multiuser-ubuntu-24.04-amd64",
        "generic-worker-build/test-multiuser-windows-server-2022-amd64",
    }
    if present := sorted(labels & forbidden_tasks):
        errors.append(f"credential-dependent tasks are present: {', '.join(present)}")

    for label, task in tasks.items():
        definition = task["task"]
        raw_scopes = definition.get("scopes", [])
        scopes = [scope_text(scope) for scope in raw_scopes]

        secret_scopes = [scope for scope in scopes if scope.startswith("secrets:get:")]
        if secret_scopes:
            errors.append(f"{label} requests secret scopes: {secret_scopes}")

        cache_scopes = [
            scope
            for scope in scopes
            if scope.startswith(("docker-worker:cache:", "generic-worker:cache:"))
        ]
        wrong_cache_scopes = [
            scope
            for scope in cache_scopes
            if not scope.startswith(
                (
                    "docker-worker:cache:taskcluster-level-0-",
                    "generic-worker:cache:taskcluster-level-0-",
                )
            )
        ]
        if wrong_cache_scopes:
            errors.append(f"{label} uses a non-level-0 cache: {wrong_cache_scopes}")

        unexpected_scopes = sorted(
            set(scopes) - set(cache_scopes) - ALLOWED_NON_CACHE_SCOPES
        )
        if unexpected_scopes:
            errors.append(f"{label} requests unexpected scopes: {unexpected_scopes}")

        worker_pool = (definition.get("provisionerId"), definition.get("workerType"))
        if worker_pool not in ALLOWED_WORKER_POOLS:
            errors.append(f"{label} uses an unapproved worker pool: {worker_pool}")

        # A docker-image index namespace shared by all untrusted pull requests
        # would let one fork poison the image another fork consumes; untrusted
        # graphs must neither publish to nor search any image index.
        routes = definition.get("routes", [])
        unexpected_routes = [route for route in routes if route != "checks"]
        if unexpected_routes:
            errors.append(f"{label} publishes unexpected routes: {unexpected_routes}")

        optimization = task.get("optimization") or {}
        indexes = optimization.get("index-search", []) if isinstance(optimization, dict) else []
        if any(DOCKER_IMAGE_INDEX_MARKER in index for index in indexes):
            errors.append(f"{label} searches a docker image index: {indexes}")

        expiry = definition.get("expires", {}).get("relative-datestamp")
        if expiry != "28 days":
            errors.append(f"{label} expires after {expiry!r}, expected '28 days'")

        env = definition.get("payload", {}).get("env", {})
        run_without_secrets = bool(task.get("attributes", {}).get("run-without-secrets"))
        untrusted_pr_env = env.get("TASKCLUSTER_UNTRUSTED_PR")
        if run_without_secrets and env and untrusted_pr_env != "true":
            errors.append(f"{label} runs without secrets but lacks TASKCLUSTER_UNTRUSTED_PR")
        if not run_without_secrets and untrusted_pr_env is not None:
            errors.append(
                f"{label} sets TASKCLUSTER_UNTRUSTED_PR without the run-without-secrets "
                "attribute, silently neutralizing NO_TEST_SKIP"
            )

    if errors:
        raise RuntimeError("Invalid untrusted task graph:\n- " + "\n- ".join(errors))


def check_no_test_skip(tasks, graph_name):
    """Every task with a payload environment must refuse to skip tests, except
    library-testing, whose secret-specific tests are allowed to skip."""
    errors = []
    for label, task in sorted(tasks.items()):
        env = task["task"].get("payload", {}).get("env")
        if not env:
            continue
        if label == "library-testing":
            if "NO_TEST_SKIP" in env:
                errors.append(f"{label} must allow secret-specific tests to skip")
        elif env.get("NO_TEST_SKIP") != "true":
            errors.append(f"{label} does not enforce NO_TEST_SKIP")
    if errors:
        raise RuntimeError(f"Invalid {graph_name} task graph:\n- " + "\n- ".join(errors))


def main():
    task_reference_scope = {"task-reference": "secrets:get:<dependency>"}
    if not production_is_secret_scope(task_reference_scope):
        raise RuntimeError("Task-reference secret scopes are not recognized")

    version = taskgraph_version()
    for name in (TRUSTED_PARAMETERS, UNTRUSTED_PARAMETERS):
        tasks = generate_target_graph(PARAMETERS_DIR / name, version)
        print(f"Generated {name}: {len(tasks)} tasks")
        check_no_test_skip(tasks, name)
        print(f"{name} NO_TEST_SKIP settings are enforced")
        if name == UNTRUSTED_PARAMETERS:
            check_untrusted_graph(tasks)
            print("Untrusted task graph security invariants passed")


if __name__ == "__main__":
    main()
