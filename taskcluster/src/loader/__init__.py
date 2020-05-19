import logging

from pathlib2 import Path

from taskgraph.util.templates import merge


logger = logging.getLogger(__name__)


def services_loader(kind, path, config, parameters, loaded_tasks):
    p = Path('./services')
    for service in [d for d in p.iterdir() if d.is_dir()]:
        job = merge(config.get("job-defaults", {}), {
            "name": service.name,
            "description": "service tests for {}".format(service.name),
            "run": {
                "command": "./db/test-setup.sh && yarn workspace taskcluster-{} coverage:report".format(service.name)
                }
            })
        logger.debug("Generating tasks for {} {}".format(kind, service.name))
        yield job
