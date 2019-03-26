# TODO The accessTokens in here should come from sops

resource "random_string" "auth_root_access_token" {
  length           = 65
  override_special = "_-"
}

resource "random_string" "built-in-workers_access_token" {
  length           = 65
  override_special = "_-"
}

resource "random_string" "github_access_token" {
  length           = 65
  override_special = "_-"
}

resource "random_string" "hooks_access_token" {
  length           = 65
  override_special = "_-"
}

resource "random_string" "notify_access_token" {
  length           = 65
  override_special = "_-"
}

resource "random_string" "index_access_token" {
  length           = 65
  override_special = "_-"
}

resource "random_string" "queue_access_token" {
  length           = 65
  override_special = "_-"
}

resource "random_string" "secrets_access_token" {
  length           = 65
  override_special = "_-"
}

resource "random_string" "web-server_access_token" {
  length           = 65
  override_special = "_-"
}

resource "random_string" "worker-manager_access_token" {
  length           = 65
  override_special = "_-"
}

locals {
  static_clients = [
    {
      clientId    = "static/taskcluster/secrets"
      accessToken = "${random_string.secrets_access_token.result}"
      description = "..."

      scopes = [
        "auth:azure-table-access:${azurerm_storage_account.base.name}/Secrets",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/Secrets",
      ]
    },
    {
      clientId    = "static/taskcluster/index"
      accessToken = "${random_string.index_access_token.result}"
      description = "..."

      scopes = [
        "auth:azure-table-access:${azurerm_storage_account.base.name}/IndexedTasks",
        "auth:azure-table-access:${azurerm_storage_account.base.name}/Namespaces",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/IndexedTasks",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/Namespaces",
        "queue:get-artifact:*",
      ]
    },
    {
      clientId    = "static/taskcluster/worker-manager"
      accessToken = "${random_string.worker-manager_access_token.result}"
      description = "..."

      scopes = []
    },
    {
      clientId    = "static/taskcluster/github"
      accessToken = "${random_string.github_access_token.result}"
      description = "..."

      scopes = [
        "assume:repo:github.com/*",
        "assume:scheduler-id:taskcluster-github/*",
        "auth:azure-table-access:${azurerm_storage_account.base.name}/TaskclusterGithubBuilds",
        "auth:azure-table-access:${azurerm_storage_account.base.name}/TaskclusterIntegrationOwners",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/TaskclusterGithubBuilds",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/TaskclusterIntegrationOwners",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/TaskclusterChecksToTasks",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/TaskclusterCheckRuns",
      ]
    },
    {
      clientId    = "static/taskcluster/hooks"
      accessToken = "${random_string.hooks_access_token.result}"
      description = "..."

      scopes = [
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/Hooks",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/Queue",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/LastFire",
        "assume:hook-id:*",
        "notify:email:*",
        "queue:create-task:*",
      ]
    },
    {
      clientId    = "static/taskcluster/notify"
      accessToken = "${random_string.notify_access_token.result}"
      description = "..."

      scopes = [
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/DenylistedNotification",
      ]
    },
    {
      clientId    = "static/taskcluster/built-in-workers"
      accessToken = "${random_string.built-in-workers_access_token.result}"
      description = "..."

      scopes = [
        "queue:claim-work:built-in/*",
        "assume:worker-id:built-in/*",
        "queue:worker-id:built-in/*",
        "queue:resolve-task",
      ]
    },
    {
      clientId    = "static/taskcluster/queue"
      accessToken = "${random_string.queue_access_token.result}"
      description = "..."

      scopes = ["*"]
    },
    {
      clientId    = "static/taskcluster/root"
      accessToken = "${random_string.auth_root_access_token.result}"
      description = "..."
      scopes      = ["*"]
    },
  ]
}
