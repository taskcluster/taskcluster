import logging

from pathlib2 import Path

from taskgraph.util.templates import merge


logger = logging.getLogger(__name__)


def services_and_libraries_loader(kind, path, config, parameters, loaded_tasks):
    for package in [d for d in Path(config["workspace"]).iterdir() if d.is_dir()]:
        job = merge(config.get("job-defaults", {}), {
            "name": package.name,
            "description": "package tests for {}".format(package.name),
            "run": {
                "command": "./db/test-setup.sh && yarn workspace taskcluster-{}{} coverage:report".format(
                    config.get("prefix", ''),
                    package.name)
                }
            }, config.get("job-overrides", {}).get(package.name, {}))
        logger.debug("Generating tasks for {} {}".format(kind, package.name))
        yield job
