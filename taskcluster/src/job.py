from taskgraph.transforms.job import run_job_using
from taskgraph.util.schema import Schema

from voluptuous import Required, Optional, Extra, Any

bare_schema = Schema({
    Required("using"): "bare",
    Required("command"): Any(basestring, [basestring]),
    Optional("install"): Any(basestring, [basestring]),
    Optional("clone"): bool,
    Extra: object
    })

bare_defaults = {
    "clone": True,
}


@run_job_using("docker-worker", "bare", schema=bare_schema, defaults=bare_defaults)
def bare_docker_worker(config, job, taskdesc):
    run = job["run"]
    worker = taskdesc['worker'] = job['worker']

    params = config.params
    command = []
    if run.get("clone"):
        command.extend([
          "git clone --quiet --depth=20 --no-single-branch {} taskcluster && ".format(params["head_repository"]),
          "cd taskcluster && ",
          "git checkout {} && ".format(params["head_rev"]),
        ])
    if run.get("install"):
        command.append(run.get("install").format(**params) + " && ")
    command.append(run["command"].format(**params))

    worker["command"] = ["/bin/bash", "-ec", "".join(command)]


@run_job_using("generic-worker", "bare", schema=bare_schema, defaults=bare_defaults)
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

