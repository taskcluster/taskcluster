import logging
from pathlib import Path

from taskgraph.util.templates import merge


logger = logging.getLogger(__name__)


def services_and_libraries_loader(kind, path, config, parameters, loaded_tasks):
    for package in [d for d in Path(config["workspace"]).iterdir() if d.is_dir()]:
        task = merge(config.get("task-defaults", {}), {
            "name": package.name,
            "description": "package tests for {}".format(package.name),
            "run": {
                "command": "yarn --immutable && " +
                "./db/test-setup.sh && yarn workspace taskcluster-{}{} coverage:report".format(
                    config.get("prefix", ''),
                    package.name)
                }
            }, config.get("task-overrides", {}).get(package.name, {}))
        logger.debug("Generating tasks for {} {}".format(kind, package.name))
        yield task
