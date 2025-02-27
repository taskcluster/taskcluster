from taskgraph.transforms.run import run_task_using
from taskgraph.util.schema import Schema

from voluptuous import Required, Optional, Extra, Any

bare_schema = Schema({
    Required("using"): "bare",
    Required("command"): Any(str, [str]),
    Optional("install"): Any(str, [str]),
    Optional("clone"): bool,
    Extra: object
    })

bare_defaults = {
    "clone": True,
}


@run_task_using("docker-worker", "bare", schema=bare_schema, defaults=bare_defaults)
def bare_docker_worker(config, job, taskdesc):
    run = job["run"]
    worker = taskdesc['worker'] = job['worker']

    params = config.params
    command = []
    if run.get("clone"):
        clone_cmd = "git config --global --add safe.directory /builds/worker/checkouts/taskcluster; " \
                   "[ ! -d /builds/worker/checkouts/taskcluster/.git ] && git clone --quiet --depth=20 " \
                   "--no-single-branch {} /builds/worker/checkouts/taskcluster; ".format(params["head_repository"])
        command.extend([
            clone_cmd,
            "cd /builds/worker/checkouts/taskcluster && ",
            "git config advice.detachedHead false && ",
            "git fetch {} {} && ".format(params["head_repository"], params["head_rev"]),
            "git checkout -f {} && ".format(params["head_rev"]),
            "git reset --hard {} && ".format(params["head_rev"]),
            "git clean -fdx && ",
        ])
    if run.get("install"):
        command.append(run.get("install").format(**params) + " && ")
    command.append(run["command"].format(**params))

    worker["command"] = ["/bin/bash", "-ec", "".join(command)]


@run_task_using("generic-worker", "bare", schema=bare_schema, defaults=bare_defaults)
def bare_generic_worker(config, job, taskdesc):
    run = job['run']
    worker = taskdesc['worker'] = job['worker']
    is_win = worker['os'] == 'windows'

    params = config.params
    command = []
    install = run.get("install")
    if install:
        if isinstance(install, list):
            command.extend([c.format(**params) for c in install])
        else:
            command.append(install.format(**params))
    if isinstance(run["command"], list):
        command.extend([c.format(**params) for c in run["command"]])
    else:
        command.append(run["command"].format(**params))

    if is_win:
        worker["command"] = command
    else:
        worker["command"] = [["/bin/bash", "-ec", "\n".join(command)]]
