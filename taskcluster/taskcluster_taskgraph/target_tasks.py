from taskgraph.target_tasks import _target_task, standard_filter


@_target_task("taskcluster-branches")
def target_tasks_taskcluster_branches(full_task_graph, parameters, graph_config):
    only_on = "all"
    if parameters["tasks_for"] == "github-push":
        if parameters["head_ref"].startswith("refs/heads/staging-release/"):
            only_on = "staging-release"
        elif parameters["head_ref"].startswith("refs/tags/v"):
            only_on = "release"

    def filter(task):
        return standard_filter(task, parameters) and task.attributes.get("only-on", "all") == only_on

    return [label for label, t in full_task_graph.tasks.iteritems() if filter(t)]
