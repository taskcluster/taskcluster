import logging

from taskgraph.target_tasks import register_target_task, standard_filter
from taskgraph.util.verify import verifications

from .constants import UNTRUSTED_PULL_REQUEST
from .scopes import is_secret_scope, scope_text

logger = logging.getLogger(__name__)


@register_target_task("taskcluster-branches")
def target_tasks_taskcluster_branches(full_task_graph, parameters, graph_config):
    only_on = "all"
    if parameters["tasks_for"] == "github-push":
        if parameters["head_ref"].startswith("refs/heads/staging-release/"):
            only_on = "staging-release"
        elif parameters["head_ref"].startswith("refs/tags/v"):
            only_on = "release"

    def filter(task):
        if not standard_filter(task, parameters):
            return False
        if task.attributes.get("only-on", "all") != only_on:
            return False

        if parameters["tasks_for"] == UNTRUSTED_PULL_REQUEST and task.kind == "generic-worker":
            logger.info("Skipping generic-worker CI task %s in an untrusted pull request", task.label)
            return False

        has_secret_scope = any(is_secret_scope(scope) for scope in task.task.get("scopes", []))
        if parameters["tasks_for"] == UNTRUSTED_PULL_REQUEST and has_secret_scope:
            logger.info("Skipping secret-dependent task %s in an untrusted pull request", task.label)
            return False
        return True

    return [label for label, t in full_task_graph.tasks.items() if filter(t)]


@verifications.add("target_task_graph")
def verify_untrusted_tasks_need_no_secrets(task, taskgraph, scratch_pad, graph_config, parameters):
    """The target-task filter drops secret-dependent tasks, but the target
    graph is the transitive closure of the kept labels, so a kept task can
    pull a secret-scoped dependency back in. Fail generation with a clear
    error instead of letting createTask fail with an opaque scope error."""
    if task is None or parameters["tasks_for"] != UNTRUSTED_PULL_REQUEST:
        return
    secret_scopes = [
        scope_text(scope)
        for scope in task.task.get("scopes", [])
        if is_secret_scope(scope)
    ]
    if secret_scopes:
        raise Exception(
            f"untrusted pull request task {task.label} requires secret scopes "
            f"{secret_scopes}; drop the dependency on it or mark it {UNTRUSTED_PULL_REQUEST!r}-safe "
            "with the run-without-secrets attribute"
        )
