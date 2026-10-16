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
APPROVED_COMMENT_PARAMETERS = "main-repo-issue-comment.yml"
CRON_PARAMETERS = "main-repo-cron.yml"
CRON_LABEL = "azure-attested-document-fetch"

DOCKER_IMAGE_INDEX_MARKER = ".docker-images."

ALLOWED_WORKER_POOLS = {
    ("built-in", "succeed"),
    ("proj-taskcluster", "gw-ubuntu-24-04"),
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

    generic_worker_tasks = sorted(
        label for label, task in tasks.items() if task.get("kind") == "generic-worker"
    )
    if generic_worker_tasks:
        errors.append(
            "generic-worker CI tasks are present: " + ", ".join(generic_worker_tasks)
        )

    if "pr-generic-worker-complete" in labels:
        errors.append("generic-worker completion task is present")

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
                    "docker-worker:cache:taskcluster-level-1-",
                    "generic-worker:cache:taskcluster-level-1-",
                )
            )
        ]
        if wrong_cache_scopes:
            errors.append(f"{label} uses a non-level-1 cache: {wrong_cache_scopes}")

        unexpected_scopes = sorted(set(scopes) - set(cache_scopes))
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


def check_trusted_graph(tasks, graph_name):
    errors = []
    labels = set(tasks)
    expected_tasks = {
        "pr-generic-worker-complete",
        "pr-complete",
        "generic-worker-build/test-insecure-ubuntu-24.04-amd64",
        "generic-worker-build/test-multiuser-macos-arm64",
        "generic-worker-build/test-multiuser-ubuntu-24.04-amd64",
        "generic-worker-build/test-multiuser-windows-server-2022-amd64",
    }
    if missing := sorted(expected_tasks - labels):
        errors.append("missing generic-worker coverage: " + ", ".join(missing))
    if not missing:
        regular_dependencies = set(tasks["pr-complete"].get("soft_dependencies", []))
        generic_worker_dependencies = set(
            tasks["pr-generic-worker-complete"].get("soft_dependencies", [])
        )
        misplaced_regular = sorted(
            dependency
            for dependency in regular_dependencies
            if tasks.get(dependency, {}).get("kind") == "generic-worker"
        )
        misplaced_generic_worker = sorted(
            dependency
            for dependency in generic_worker_dependencies
            if dependency in tasks and tasks[dependency].get("kind") != "generic-worker"
        )
        if misplaced_regular or misplaced_generic_worker:
            errors.append("PR completion dependencies are not split by task kind")

    release_tasks = sorted(
        label
        for label, task in tasks.items()
        if task["task"].get("workerType") == "release"
    )
    if release_tasks:
        errors.append("pull-request graph schedules release tasks: " + ", ".join(release_tasks))

    if errors:
        raise RuntimeError(f"Invalid {graph_name} task graph:\n- " + "\n- ".join(errors))


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


def check_cron_graph(tasks):
    """The cron target graph is the attested-document job and nothing else,
    apart from always_target docker images (which index-optimize away when the
    graph is actually submitted)."""
    errors = []
    if CRON_LABEL not in tasks:
        errors.append(f"missing {CRON_LABEL}")
    else:
        definition = tasks[CRON_LABEL]["task"]
        worker_pool = (definition.get("provisionerId"), definition.get("workerType"))
        if worker_pool != ("proj-taskcluster", "gw-windows-2022-gui"):
            errors.append(f"{CRON_LABEL} uses the wrong worker pool: {worker_pool}")
        index_route = "index.project.taskcluster.azure.attested-document.latest"
        if index_route not in definition.get("routes", []):
            errors.append(f"{CRON_LABEL} is not indexed at {index_route}")

    ci_tasks = sorted(
        label
        for label, task in tasks.items()
        if label != CRON_LABEL and task.get("kind") != "docker-image"
    )
    if ci_tasks:
        errors.append("cron graph schedules CI tasks: " + ", ".join(ci_tasks))

    if errors:
        raise RuntimeError("Invalid cron task graph:\n- " + "\n- ".join(errors))


RELEASE_PARAMETERS = "release-tag.yml"
STAGING_PARAMETERS = "staging-release.yml"

RELEASE_BUILD_NAMES = {
    "image-monoimage",
    "image-monoimage-devel",
    "image-generic-worker",
    "image-livelog",
    "image-taskcluster-proxy",
    "image-websocktunnel",
    "binaries-generic-worker",
    "binaries-worker-runner",
    "binaries-livelog",
    "binaries-taskcluster-proxy",
    "binaries-client-shell",
    "npm-client",
    "npm-client-web",
    "python-client",
    "rust-client",
}


def release_kind_tasks(tasks, kind):
    return {label: task for label, task in tasks.items() if task.get("kind") == kind}


def check_release_build(tasks, graph_name, staging):
    errors = []
    builds = release_kind_tasks(tasks, "release-build")
    expected = {f"release-build-{name}" for name in RELEASE_BUILD_NAMES}
    if missing := sorted(expected - set(builds)):
        errors.append("missing release builds: " + ", ".join(missing))
    for label, task in builds.items():
        definition = task["task"]
        scopes = [scope_text(scope) for scope in definition.get("scopes", [])]
        if secret := [s for s in scopes if s.startswith("secrets:")]:
            errors.append(f"{label} must not have secret scopes: {secret}")
        if definition.get("workerType") != "release":
            errors.append(f"{label} must run on the release pool")
        env = definition.get("payload", {}).get("env", {})
        if env.get("RELEASE_VERSION") != "113.2.0":
            errors.append(f"{label} has RELEASE_VERSION {env.get('RELEASE_VERSION')!r}")
        if (env.get("STAGING") == "1") != staging:
            errors.append(f"{label} has STAGING={env.get('STAGING')!r}")
    devel = builds.get("release-build-image-monoimage-devel", {})
    if "release-build-image-monoimage" not in devel.get("dependencies", {}).values():
        errors.append("image-monoimage-devel must depend on image-monoimage")
    pypi = tasks.get("release-publish-pypi", {})
    if "release-build-python-client" not in pypi.get("dependencies", {}).values():
        errors.append("release-publish-pypi must publish what release-build-python-client built")
    if errors:
        raise RuntimeError(f"Invalid {graph_name} task graph:\n- " + "\n- ".join(errors))


MALFORMED_RELEASE_PARAMETERS = "release-tag-malformed.yml"
MAIN_PUSH_PARAMETERS = "main-repo-main-push.yml"

IMAGES = ["monoimage", "monoimage-devel", "generic-worker", "livelog", "taskcluster-proxy", "websocktunnel"]
RELEASE_PUBLISH_LABELS = {f"release-publish-push-image-{i}" for i in IMAGES} | {
    "release-publish-github-release-draft",
    "release-publish-pypi",
    "release-publish-crates",
}
RELEASE_FINALIZE_LABELS = {
    "release-finalize-github-release-publish",
    "release-finalize-publish-homebrew",
}
RELEASE_KINDS = ("release-build", "release-gate", "release-publish", "release-finalize", "release-notify")


def ancestors(tasks, label, seen=None):
    seen = set() if seen is None else seen
    for dep in tasks[label].get("dependencies", {}).values():
        if dep not in seen:
            seen.add(dep)
            ancestors(tasks, dep, seen)
    return seen


def check_release_pipeline(tasks, graph_name, staging):
    errors = []
    labels = set(tasks)
    homebrew_label = "release-finalize-publish-homebrew"
    finalize = RELEASE_FINALIZE_LABELS - {homebrew_label} if staging else RELEASE_FINALIZE_LABELS
    expected = RELEASE_PUBLISH_LABELS | finalize | {"release-gate-builds", "release-notify-email"}
    if missing := sorted(expected - labels):
        errors.append("missing release tasks: " + ", ".join(missing))
    if staging and homebrew_label in labels:
        errors.append("staging graph must not update the Homebrew tap")
    if old := sorted(label for label in labels if tasks[label].get("kind") == "release"):
        errors.append("old single-task release kind is still present: " + ", ".join(old))

    builds = {label for label in labels if tasks[label].get("kind") == "release-build"}
    gate_deps = set(tasks.get("release-gate-builds", {}).get("dependencies", {}).values())
    if gate_deps != builds:
        errors.append(
            f"release-gate-builds must depend on exactly the builds; extra/missing: {sorted(gate_deps ^ builds)}"
        )

    secret = "secrets:get:project/taskcluster/" + ("staging-release" if staging else "release")
    for label in sorted(labels & (RELEASE_PUBLISH_LABELS | finalize)):
        if "release-gate-builds" not in ancestors(tasks, label):
            errors.append(f"{label} can run before release-gate-builds")
        scopes = [scope_text(s) for s in tasks[label]["task"].get("scopes", [])]
        if secret not in scopes:
            errors.append(f"{label} lacks {secret}")
        env = tasks[label]["task"].get("payload", {}).get("env", {})
        if (env.get("STAGING") == "1") != staging:
            errors.append(f"{label} has STAGING={env.get('STAGING')!r}")

    if not staging:
        homebrew = set(tasks.get("release-finalize-publish-homebrew", {}).get("dependencies", {}).values())
        if "release-finalize-github-release-publish" not in homebrew:
            errors.append("publish-homebrew must depend on github-release-publish")
    gh_publish = "release-finalize-github-release-publish"
    waits_for = ancestors(tasks, gh_publish) if gh_publish in tasks else set()
    if missing := sorted(RELEASE_PUBLISH_LABELS - waits_for):
        errors.append("github-release-publish does not wait for: " + ", ".join(missing))

    notify = tasks.get("release-notify-email", {})
    notify_needs = finalize
    if missing := sorted(notify_needs - set(notify.get("dependencies", {}).values())):
        errors.append("release-notify-email does not wait for: " + ", ".join(missing))
    if not staging and not any(
        r.startswith("notify.email.") for r in notify.get("task", {}).get("routes", [])
    ):
        errors.append("release-notify-email has no notify.email route")

    for label in labels:
        if tasks[label].get("kind") not in RELEASE_KINDS:
            continue
        definition = tasks[label]["task"]
        routes = definition.get("routes", [])
        if staging:
            # The staging-releases project has no notify scopes.
            if email := [r for r in routes if r.startswith("notify.email.")]:
                errors.append(f"{label} has email routes in staging: {email}")
        elif definition.get("provisionerId") != "built-in":
            for state in ("on-failed", "on-exception"):
                if not any(r.startswith("notify.email.") and r.endswith(state) for r in routes):
                    errors.append(f"{label} does not email {state}")
        if definition.get("deadline", {}).get("relative-datestamp") != "4 days":
            errors.append(f"{label} deadline is {definition.get('deadline')!r}, expected 4 days")
        if definition.get("requires", "all-completed") != "all-completed":
            errors.append(f"{label} must require all-completed")

    if errors:
        raise RuntimeError(f"Invalid {graph_name} task graph:\n- " + "\n- ".join(errors))


SHA256 = re.compile(r"[0-9a-f]{64}")


def check_release_mount_hashes(tasks, graph_name):
    """Every toolchain a release task downloads is pinned by sha256, which
    generic-worker verifies before extracting it."""
    errors = []
    for label, task in sorted(tasks.items()):
        if task.get("kind") not in RELEASE_KINDS:
            continue
        for mount in task["task"].get("payload", {}).get("mounts", []):
            content = mount.get("content", {})
            if "url" in content and not SHA256.fullmatch(str(content.get("sha256", ""))):
                errors.append(f"{label} mounts {content['url']} without a sha256")
    if errors:
        raise RuntimeError(f"Invalid {graph_name} task graph:\n- " + "\n- ".join(errors))


def mounted_artifacts(task):
    """(producing task label, artifact name) for each artifact mounted into a task."""
    deps = task.get("dependencies", {})
    result = set()
    for mount in task["task"].get("payload", {}).get("mounts", []):
        content = mount.get("content", {})
        ref = content.get("taskId", {})
        if "artifact" in content and isinstance(ref, dict) and "task-reference" in ref:
            result.add((deps.get(ref["task-reference"].strip("<>")), content["artifact"]))
    return result


def check_release_artifact_mounts(tasks, graph_name, staging):
    """Publish steps mount exactly what their builds produced."""
    errors = []
    expected = {
        f"release-publish-push-image-{image}": {
            (f"release-build-image-{image}", f"public/build/{image}.{suffix}")
            for suffix in ("tar.gz", "digest", "tag")
        }
        for image in IMAGES
    }
    expected["release-finalize-github-release-publish"] = {
        ("release-publish-github-release-draft", "public/build/expected-assets.json")
    }
    if not staging:
        expected["release-finalize-publish-homebrew"] = {
            ("release-build-binaries-client-shell", "public/homebrew/taskcluster.rb")
        }
    for label, want in sorted(expected.items()):
        if label not in tasks:
            errors.append(f"missing {label}")
        elif (got := mounted_artifacts(tasks[label])) != want:
            errors.append(f"{label} mounts {sorted(got)}, expected {sorted(want)}")
    if errors:
        raise RuntimeError(f"Invalid {graph_name} task graph:\n- " + "\n- ".join(errors))


def check_no_release_tasks(tasks, graph_name):
    if release := sorted(label for label, t in tasks.items() if t.get("kind", "").startswith("release")):
        raise RuntimeError(f"{graph_name} graph contains release tasks: " + ", ".join(release))


def check_malformed_release_ref(version):
    try:
        generate_target_graph(PARAMETERS_DIR / MALFORMED_RELEASE_PARAMETERS, version)
    except subprocess.CalledProcessError as err:
        if "release tags must be of the form vX.Y.Z" not in (err.stderr or ""):
            raise RuntimeError(f"malformed release ref failed for the wrong reason:\n{err.stderr}")
        return
    raise RuntimeError("malformed release ref refs/tags/vfoo generated a graph")


def main():
    task_reference_scope = {"task-reference": "secrets:get:<dependency>"}
    if not production_is_secret_scope(task_reference_scope):
        raise RuntimeError("Task-reference secret scopes are not recognized")

    version = taskgraph_version()
    graphs = (
        (TRUSTED_PARAMETERS, "trusted pull request", True),
        (APPROVED_COMMENT_PARAMETERS, "approved comment", True),
        (UNTRUSTED_PARAMETERS, "untrusted pull request", False),
    )
    for parameter_file, graph_name, trusted in graphs:
        tasks = generate_target_graph(PARAMETERS_DIR / parameter_file, version)
        print(f"Generated task graph with {len(tasks)} tasks")
        if CRON_LABEL in tasks:
            raise RuntimeError(f"{graph_name} graph schedules the cron job {CRON_LABEL}")
        check_no_test_skip(tasks, graph_name)
        check_no_release_tasks(tasks, graph_name)
        if trusted:
            check_trusted_graph(tasks, graph_name)
            print("Trusted task graph includes generic-worker CI")
        else:
            check_untrusted_graph(tasks)
            print("Untrusted task graph security invariants passed")

    tasks = generate_target_graph(PARAMETERS_DIR / CRON_PARAMETERS, version)
    print(f"Generated cron task graph with {len(tasks)} tasks")
    check_cron_graph(tasks)
    print("Cron task graph selects only the attested-document job")

    for parameter_file, graph_name, staging in (
        (RELEASE_PARAMETERS, "release", False),
        (STAGING_PARAMETERS, "staging release", True),
    ):
        tasks = generate_target_graph(PARAMETERS_DIR / parameter_file, version)
        print(f"Generated {graph_name} task graph with {len(tasks)} tasks")
        check_release_build(tasks, graph_name, staging)
        print(f"{graph_name} graph has the expected build tasks")
        check_release_pipeline(tasks, graph_name, staging)
        print(f"{graph_name} graph has the expected gated release pipeline")
        check_release_mount_hashes(tasks, graph_name)
        check_release_artifact_mounts(tasks, graph_name, staging)
        print(f"{graph_name} graph pins every toolchain download by sha256")

    tasks = generate_target_graph(PARAMETERS_DIR / MAIN_PUSH_PARAMETERS, version)
    check_no_release_tasks(tasks, "main push")
    check_malformed_release_ref(version)
    print("Non-release graphs contain no release tasks; malformed release refs are rejected")


if __name__ == "__main__":
    main()
