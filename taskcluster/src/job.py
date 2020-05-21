from taskgraph.transforms.job import run_job_using
from taskgraph.util.schema import Schema

from voluptuous import Required, Optional, Extra

bare_schema = Schema({
    Required("using"): "bare",
    Required("command"): basestring,
    Optional("install"): basestring,
    Optional("pre-clone"): basestring,
    Optional("skip-clone"): bool,
    Extra: object
    })


@run_job_using("docker-worker", "bare", schema=bare_schema)
def bare_docker_worker(config, job, taskdesc):
    run = job["run"]
    worker = taskdesc['worker'] = job['worker']

    pre_clone = run.get("pre-clone", "")
    if pre_clone:
        pre_clone += " && "
    install_command = run.get("install", "")
    if install_command:
        install_command += " && "
    run_command = run["command"]

    if run.get("skip-clone"):
        worker["command"] = ["{}{}{}".format(pre_clone, install_command, run_command)]
    else:
        worker["command"] = [
                "/bin/bash",
                "-c",
                "".join([
                    "{pre_clone}",
                    "git clone --quiet --depth=20 --no-single-branch {head_repository} taskcluster && ",
                    "cd taskcluster && ",
                    "git checkout {head_rev} && ",
                    "{install_command}",
                    "{run_command}",
                    ]).format(
                        install_command=install_command,
                        run_command=run_command,
                        pre_clone=pre_clone,
                        **config.params
                        ),
                    ]


@run_job_using("generic-worker", "bare", schema=bare_schema)
def bare_generic_worker(config, job, taskdesc):
    return [bare_docker_worker(config, job, taskdesc)]
