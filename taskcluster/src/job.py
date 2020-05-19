from taskgraph.transforms.job import run_job_using
from taskgraph.util.schema import Schema

from voluptuous import Required, Optional

gradlew_schema = Schema({
    Required("using"): "bare",
    Required("command"): str,
    Optional("install"): str,
})


@run_job_using("docker-worker", "bare")
def bare(config, job, taskdesc):
    run = job["run"]
    worker = taskdesc['worker'] = job['worker']

    worker["command"] = [
        "/bin/bash",
        "-c",
        " ".join([
            "git clone --quiet --depth=20 --no-single-branch {head_repository} taskcluster &&",
            "cd taskcluster &&",
            "git checkout {head_rev} &&",
            "{install_command} &&",
            "{run_command}",
        ]).format(
            install_command=run.get("install", "true"),
            run_command=run["command"],
            **config.params
        ),
    ]
