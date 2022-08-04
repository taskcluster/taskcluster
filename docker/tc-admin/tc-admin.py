from tcadmin.appconfig import AppConfig
from tcadmin.resources import Role, WorkerPool, Secret
from tcadmin.main import main
import os
import copy


appconfig = AppConfig()


@appconfig.generators.register
async def anonymous(resources):
    resources.manage("Role=anonymous")
    scopes = [
        "auth:current-scopes",
        "auth:expand-scopes",
        "auth:get-client:*",
        "auth:get-role:*",
        "auth:list-clients",
        "auth:list-roles",
        "github:get-badge:*",
        "github:get-repository:*",
        "github:latest-status:*",
        "github:list-builds",
        "hooks:get:*",
        "hooks:list-hooks:*",
        "hooks:list-last-fires:*",
        "hooks:status:*",
        "index:find-task:*",
        "index:list-namespaces:*",
        "index:list-tasks:*",
        "purge-cache:all-purge-requests",
        "purge-cache:purge-requests:*",
        "queue:get-artifact:public/*",
        "queue:get-provisioner:*",
        "queue:get-task:*",
        "queue:get-worker-type:*",
        "queue:get-worker:*",
        "queue:list-artifacts:*",
        "queue:list-dependent-tasks:*",
        "queue:list-provisioners",
        "queue:list-task-group:*",
        "queue:list-worker-types:*",
        "queue:list-workers:*",
        "queue:pending-count:*",
        "queue:status:*",
        "secrets:list-secrets",
        "worker-manager:get-worker-pool:*",
        "worker-manager:get-worker:*",
        "worker-manager:list-providers",
        "worker-manager:list-worker-pool-errors:*",
        "worker-manager:list-worker-pools",
        "worker-manager:list-workers:*",
    ]
    description = "This role is managed by tc-admin. See [documentation](/docs/manual/deploying/anonymous-role#anonymous-role)"

    resources.add(Role(roleId="anonymous", scopes=scopes, description=description))


@appconfig.generators.register
async def secrets(resources):
    resources.manage("Secret=secretvalue")

    resources.add(Secret(name="secretvalue", secret={"secret": "Something no one should see"}))


@appconfig.generators.register
async def static_worker(resources):
    workerPoolId = "docker-compose/generic-worker"
    resources.manage(f"WorkerPool={workerPoolId}")

    workerPool = WorkerPool(
        workerPoolId=workerPoolId,
        providerId="static",
        config={},
        description="This pool is managed by tc-admin. See [documentation](/docs/manual/deploying/anonymous-role#anonymous-role)",
        owner="developer@taskcluster.local",
        emailOnError=False,
    )

    resources.add(workerPool)


def boot():
    main(appconfig)


if __name__ == "__main__":
    boot()
