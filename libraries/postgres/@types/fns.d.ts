// Generated type definitions for DB functions
// DO NOT EDIT MANUALLY

export type DbFunctionMode = "read" | "write";
export type JsonB = any; // PostgreSQL JSONB type
export type TaskRequires = string; // Enum type from DB
export type TaskPriority = string; // Enum type from DB

// auth function signatures

/** @deprecated */
export type AuthClientsEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type AuthClientsEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type AuthClientsEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type AuthClientsEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type AuthClientsEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type AuthCreateClientFn = (
  client_id_in: string,
  description_in: string,
  encrypted_access_token_in: JsonB,
  expires_in: Date,
  disabled_in: boolean,
  scopes_in: JsonB,
  delete_on_expiration_in: boolean
) => Promise<void>;

export type AuthDeleteClientFn = (
  client_id_in: string
) => Promise<void>;

export type AuthExpireClientsFn = (
) => Promise<number>;

export type AuthGetClientFn = (
  client_id_in: string
) => Promise<void>;

export type AuthGetClientsFn = (
  prefix_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<void>;

export type AuthGetRolesFn = (
) => Promise<Array<{role_id: string, scopes: JsonB, created: Date, description: string, last_modified: Date, etag: string}>>;

export type AuthModifyRolesFn = (
  roles_in: JsonB,
  old_etag_in: string
) => Promise<void>;

/** @deprecated */
export type AuthRolesEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type AuthRolesEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type AuthRolesEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type AuthRolesEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type AuthRolesEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type AuthUpdateClientFn = (
  client_id_in: string,
  description_in: string,
  encrypted_access_token_in: JsonB,
  expires_in: Date,
  disabled_in: boolean,
  scopes_in: JsonB,
  delete_on_expiration_in: boolean
) => Promise<void>;

export type AuthUpdateClientLastUsedFn = (
  client_id_in: string
) => Promise<void>;

// github function signatures

/** @deprecated */
export type GithubCreateGithubBuildDeprecatedFn = (
  organization_in: string,
  repository_in: string,
  sha_in: string,
  task_group_id_in: string,
  state_in: string,
  created_in: Date,
  updated_in: Date,
  installation_id_in: number,
  event_type_in: string,
  event_id_in: string
) => Promise<void>;

export type GithubCreateGithubBuildPrFn = (
  organization_in: string,
  repository_in: string,
  sha_in: string,
  task_group_id_in: string,
  state_in: string,
  created_in: Date,
  updated_in: Date,
  installation_id_in: number,
  event_type_in: string,
  event_id_in: string,
  pull_request_number_in: number
) => Promise<void>;

export type GithubCreateGithubCheckFn = (
  task_group_id_in: string,
  task_id_in: string,
  check_suite_id_in: string,
  check_run_id_in: string
) => Promise<void>;

export type GithubDeleteGithubBuildFn = (
  task_group_id_in: string
) => Promise<void>;

/** @deprecated */
export type GithubGetGithubBuildDeprecatedFn = (
  task_group_id_in: string
) => Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, etag: string}>>;

export type GithubGetGithubBuildPrFn = (
  task_group_id_in: string
) => Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, pull_request_number: number, etag: string}>>;

/** @deprecated */
export type GithubGetGithubBuildsDeprecatedFn = (
  page_size_in: number,
  page_offset_in: number,
  organization_in: string,
  repository_in: string,
  sha_in: string
) => Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, etag: string}>>;

export type GithubGetGithubBuildsPrFn = (
  page_size_in: number,
  page_offset_in: number,
  organization_in: string,
  repository_in: string,
  sha_in: string,
  pull_request_number_in: number
) => Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, pull_request_number: number, etag: string}>>;

export type GithubGetGithubCheckByRunIdFn = (
  check_suite_id_in: string,
  check_run_id_in: string
) => Promise<void>;

export type GithubGetGithubCheckByTaskGroupAndTaskIdFn = (
  task_group_id_in: string,
  task_id_in: string
) => Promise<Array<{task_group_id: string, task_id: string, check_suite_id: string, check_run_id: string}>>;

/** @deprecated */
export type GithubGetGithubCheckByTaskIdDeprecatedFn = (
  task_id_in: string
) => Promise<Array<{task_group_id: string, task_id: string, check_suite_id: string, check_run_id: string}>>;

export type GithubGetGithubChecksByTaskGroupIdFn = (
  page_size_in: number,
  page_offset_in: number,
  task_group_id_in: string
) => Promise<Array<{task_group_id: string, task_id: string, check_suite_id: string, check_run_id: string}>>;

export type GithubGetGithubIntegrationFn = (
  owner_in: string
) => Promise<Array<{owner: string, installation_id: number}>>;

export type GithubGetGithubIntegrationsFn = (
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{owner: string, installation_id: number}>>;

export type GithubGetPendingGithubBuildsFn = (
  page_size_in: number,
  page_offset_in: number,
  organization_in: string,
  repository_in: string,
  sha_in: string,
  pull_request_number_in: number
) => Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, pull_request_number: number, etag: string}>>;

export type GithubSetGithubBuildStateFn = (
  task_group_id_in: string,
  state_in: string
) => Promise<void>;

/** @deprecated */
export type GithubTaskclusterCheckRunsEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type GithubTaskclusterCheckRunsEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type GithubTaskclusterCheckRunsEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type GithubTaskclusterCheckRunsEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type GithubTaskclusterCheckRunsEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type GithubTaskclusterChecksToTasksEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type GithubTaskclusterChecksToTasksEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type GithubTaskclusterChecksToTasksEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type GithubTaskclusterChecksToTasksEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type GithubTaskclusterChecksToTasksEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type GithubTaskclusterGithubBuildsEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type GithubTaskclusterGithubBuildsEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type GithubTaskclusterGithubBuildsEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type GithubTaskclusterGithubBuildsEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type GithubTaskclusterGithubBuildsEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type GithubTaskclusterIntegrationOwnersEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type GithubTaskclusterIntegrationOwnersEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type GithubTaskclusterIntegrationOwnersEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type GithubTaskclusterIntegrationOwnersEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type GithubTaskclusterIntegrationOwnersEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type GithubUpsertGithubIntegrationFn = (
  owner_in: string,
  installation_id_in: number
) => Promise<void>;

// hooks function signatures

export type HooksCreateHookFn = (
  hook_group_id_in: string,
  hook_id_in: string,
  metadata_in: JsonB,
  task_in: JsonB,
  bindings_in: JsonB,
  schedule_in: JsonB,
  encrypted_trigger_token_in: JsonB,
  encrypted_next_task_id_in: JsonB,
  next_scheduled_date_in: Date,
  trigger_schema_in: JsonB
) => Promise<Array<{hook_group_id: string, hook_id: string, metadata: JsonB, task: JsonB, bindings: JsonB, schedule: JsonB, encrypted_trigger_token: JsonB, encrypted_next_task_id: JsonB, next_scheduled_date: Date, trigger_schema: JsonB}>>;

export type HooksCreateHooksQueueFn = (
  hook_group_id_in: string,
  hook_id_in: string,
  queue_name_in: string,
  bindings_in: JsonB
) => Promise<string>;

export type HooksCreateLastFireFn = (
  hook_group_id_in: string,
  hook_id_in: string,
  fired_by_in: string,
  task_id_in: string,
  task_create_time_in: Date,
  result_in: string,
  error_in: string
) => Promise<string>;

export type HooksDeleteHookFn = (
  hook_group_id_in: string,
  hook_id_in: string
) => Promise<void>;

export type HooksDeleteHooksQueueFn = (
  hook_group_id_in: string,
  hook_id_in: string
) => Promise<void>;

export type HooksDeleteLastFiresFn = (
  hook_group_id_in: string,
  hook_id_in: string
) => Promise<void>;

export type HooksExpireLastFiresFn = (
) => Promise<number>;

export type HooksGetHookFn = (
  hook_group_id_in: string,
  hook_id_in: string
) => Promise<Array<{hook_group_id: string, hook_id: string, metadata: JsonB, task: JsonB, bindings: JsonB, schedule: JsonB, encrypted_trigger_token: JsonB, encrypted_next_task_id: JsonB, next_scheduled_date: Date, trigger_schema: JsonB}>>;

export type HooksGetHooksFn = (
  hook_group_id_in: string,
  next_scheduled_date_in: Date,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{hook_group_id: string, hook_id: string, metadata: JsonB, task: JsonB, bindings: JsonB, schedule: JsonB, encrypted_trigger_token: JsonB, encrypted_next_task_id: JsonB, next_scheduled_date: Date, trigger_schema: JsonB}>>;

export type HooksGetHooksQueuesFn = (
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{hook_group_id: string, hook_id: string, queue_name: string, bindings: JsonB, etag: string}>>;

export type HooksGetLastFireFn = (
  hook_group_id_in: string,
  hook_id_in: string,
  task_id_in: string
) => Promise<Array<{hook_group_id: string, hook_id: string, fired_by: string, task_id: string, task_create_time: Date, result: string, error: string, etag: string}>>;

/** @deprecated */
export type HooksGetLastFiresDeprecatedFn = (
  hook_group_id_in: string,
  hook_id_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{hook_group_id: string, hook_id: string, fired_by: string, task_id: string, task_create_time: Date, result: string, error: string, etag: string}>>;

export type HooksGetLastFiresWithTaskStateFn = (
  hook_group_id_in: string,
  hook_id_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{hook_group_id: string, hook_id: string, fired_by: string, task_id: string, task_create_time: Date, result: string, error: string, etag: string, task_state: string}>>;

/** @deprecated */
export type HooksHooksEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type HooksHooksEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type HooksHooksEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type HooksHooksEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type HooksHooksEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type HooksLastFire3EntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type HooksLastFire3EntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type HooksLastFire3EntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type HooksLastFire3EntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type HooksLastFire3EntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type HooksQueuesEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type HooksQueuesEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type HooksQueuesEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type HooksQueuesEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type HooksQueuesEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type HooksUpdateHookFn = (
  hook_group_id_in: string,
  hook_id_in: string,
  metadata_in: JsonB,
  task_in: JsonB,
  bindings_in: JsonB,
  schedule_in: JsonB,
  encrypted_trigger_token_in: JsonB,
  encrypted_next_task_id_in: JsonB,
  next_scheduled_date_in: Date,
  trigger_schema_in: JsonB
) => Promise<Array<{hook_group_id: string, hook_id: string, metadata: JsonB, task: JsonB, bindings: JsonB, schedule: JsonB, encrypted_trigger_token: JsonB, encrypted_next_task_id: JsonB, next_scheduled_date: Date, trigger_schema: JsonB}>>;

export type HooksUpdateHooksQueueBindingsFn = (
  hook_group_id_in: string,
  hook_id_in: string,
  bindings_in: JsonB
) => Promise<Array<{hook_group_id: string, hook_id: string, queue_name: string, bindings: JsonB, etag: string}>>;

// index function signatures

export type IndexCreateIndexNamespaceFn = (
  parent_in: string,
  name_in: string,
  expires_in: Date
) => Promise<Array<{parent: string, name: string, expires: Date}>>;

export type IndexCreateIndexedTaskFn = (
  namespace_in: string,
  name_in: string,
  rank_in: number,
  task_id_in: string,
  data_in: JsonB,
  expires_in: Date
) => Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;

export type IndexDeleteIndexedTaskFn = (
  namespace_in: string,
  name_in: string
) => Promise<void>;

export type IndexExpireIndexNamespacesFn = (
) => Promise<number>;

export type IndexExpireIndexedTasksFn = (
) => Promise<number>;

export type IndexGetIndexNamespaceFn = (
  parent_in: string,
  name_in: string
) => Promise<Array<{parent: string, name: string, expires: Date}>>;

export type IndexGetIndexNamespacesFn = (
  parent_in: string,
  name_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{parent: string, name: string, expires: Date}>>;

export type IndexGetIndexedTaskFn = (
  namespace_in: string,
  name_in: string
) => Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;

export type IndexGetIndexedTasksFn = (
  namespace_in: string,
  name_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;

/** @deprecated */
export type IndexGetTasksFromIndexesDeprecatedFn = (
  indexes_in: JsonB,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;

export type IndexGetTasksFromIndexesAndNamespacesFn = (
  indexes_in: JsonB,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;

/** @deprecated */
export type IndexIndexedTasksEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type IndexIndexedTasksEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type IndexIndexedTasksEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type IndexIndexedTasksEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type IndexIndexedTasksEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type IndexNamespacesEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type IndexNamespacesEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type IndexNamespacesEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type IndexNamespacesEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type IndexNamespacesEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type IndexUpdateIndexNamespaceFn = (
  parent_in: string,
  name_in: string,
  expires_in: Date
) => Promise<Array<{parent: string, name: string, expires: Date}>>;

export type IndexUpdateIndexedTaskFn = (
  namespace_in: string,
  name_in: string,
  rank_in: number,
  task_id_in: string,
  data_in: JsonB,
  expires_in: Date
) => Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;

// notify function signatures

export type NotifyAddDenylistAddressFn = (
  notification_type_in: string,
  notification_address_in: string
) => Promise<void>;

export type NotifyAllDenylistAddressesFn = (
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{notification_type: string, notification_address: string}>>;

export type NotifyDeleteDenylistAddressFn = (
  notification_type_in: string,
  notification_address_in: string
) => Promise<number>;

/** @deprecated */
export type NotifyDenylistedNotificationEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type NotifyDenylistedNotificationEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type NotifyDenylistedNotificationEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type NotifyDenylistedNotificationEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type NotifyDenylistedNotificationEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type NotifyExistsDenylistAddressFn = (
  notification_type_in: string,
  notification_address_in: string
) => Promise<boolean>;

/** @deprecated */
export type NotifyUpdateWidgetsDeprecatedFn = (
  name_in: string
) => Promise<Array<{name: string}>>;

// object function signatures

export type ObjectAddObjectHashesFn = (
  name_in: string,
  hashes_in: JsonB
) => Promise<void>;

/** @deprecated */
export type ObjectCreateObjectDeprecatedFn = (
  name_in: string,
  project_id_in: string,
  backend_id_in: string,
  data_in: JsonB,
  expires_in: Date
) => Promise<void>;

export type ObjectCreateObjectForUploadFn = (
  name_in: string,
  project_id_in: string,
  backend_id_in: string,
  upload_id_in: string,
  upload_expires_in: Date,
  data_in: JsonB,
  expires_in: Date
) => Promise<void>;

export type ObjectDeleteObjectFn = (
  name_in: string
) => Promise<void>;

export type ObjectGetExpiredObjectsFn = (
  limit_in: number,
  start_at_in: string
) => Promise<Array<{name: string, data: JsonB, project_id: string, backend_id: string, expires: Date}>>;

/** @deprecated */
export type ObjectGetObjectDeprecatedFn = (
  name_in: string
) => Promise<Array<{name: string, data: JsonB, project_id: string, backend_id: string, expires: Date}>>;

export type ObjectGetObjectHashesFn = (
  name_in: string
) => Promise<Array<{algorithm: string, hash: string}>>;

export type ObjectGetObjectWithUploadFn = (
  name_in: string
) => Promise<Array<{name: string, data: JsonB, project_id: string, backend_id: string, upload_id: string, upload_expires: Date, expires: Date}>>;

export type ObjectObjectUploadCompleteFn = (
  name_in: string,
  upload_id_in: string
) => Promise<void>;

// purge_cache function signatures

/** @deprecated */
export type PurgeCacheAllPurgeRequestsDeprecatedFn = (
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{provisioner_id: string, worker_type: string, cache_name: string, before: Date}>>;

export type PurgeCacheAllPurgeRequestsWpidFn = (
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, cache_name: string, before: Date}>>;

/** @deprecated */
export type PurgeCacheCachePurgesEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type PurgeCacheCachePurgesEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type PurgeCacheCachePurgesEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type PurgeCacheCachePurgesEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type PurgeCacheCachePurgesEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type PurgeCacheExpireCachePurgesFn = (
  expires_in: Date
) => Promise<number>;

/** @deprecated */
export type PurgeCachePurgeCacheDeprecatedFn = (
  provisioner_id_in: string,
  worker_type_in: string,
  cache_name_in: string,
  before_in: Date,
  expires_in: Date
) => Promise<void>;

export type PurgeCachePurgeCacheWpidFn = (
  worker_pool_id_in: string,
  cache_name_in: string,
  before_in: Date,
  expires_in: Date
) => Promise<void>;

/** @deprecated */
export type PurgeCachePurgeRequestsDeprecatedFn = (
  provisioner_id_in: string,
  worker_type_in: string
) => Promise<Array<{provisioner_id: string, worker_type: string, cache_name: string, before: Date}>>;

export type PurgeCachePurgeRequestsWpidFn = (
  worker_pool_id_in: string
) => Promise<Array<{worker_pool_id: string, cache_name: string, before: Date}>>;

// queue function signatures

export type QueueAddTaskDependenciesFn = (
  dependent_task_id_in: string,
  required_task_ids_in: JsonB,
  requires_in: TaskRequires,
  expires_in: Date
) => Promise<void>;

export type QueueAddTaskDependencyFn = (
  dependent_task_id_in: string,
  required_task_id_in: string,
  requires_in: TaskRequires,
  expires_in: Date
) => Promise<void>;

/** @deprecated */
export type QueueAzureQueueCountDeprecatedFn = (
  queue_name: string
) => Promise<number>;

/** @deprecated */
export type QueueAzureQueueDeleteDeprecatedFn = (
  queue_name: string,
  message_id: string,
  pop_receipt: string
) => Promise<void>;

/** @deprecated */
export type QueueAzureQueueDeleteExpiredDeprecatedFn = (
) => Promise<void>;

/** @deprecated */
export type QueueAzureQueueGetDeprecatedFn = (
  queue_name: string,
  visible: any,
  count: number
) => Promise<Array<{message_id: string, message_text: string, pop_receipt: string}>>;

/** @deprecated */
export type QueueAzureQueuePutDeprecatedFn = (
  queue_name: string,
  message_text: string,
  visible: any,
  expires: any
) => Promise<void>;

/** @deprecated */
export type QueueAzureQueuePutExtraDeprecatedFn = (
  queue_name: string,
  message_text: string,
  visible: any,
  expires: any,
  task_queue_id: string,
  priority: number
) => Promise<void>;

/** @deprecated */
export type QueueAzureQueueUpdateDeprecatedFn = (
  queue_name: string,
  message_text: string,
  message_id: string,
  pop_receipt: string,
  visible: any
) => Promise<void>;

export type QueueCancelTaskFn = (
  task_id: string,
  reason: string
) => Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;

export type QueueCancelTaskGroupFn = (
  task_group_id_in: string,
  reason: string
) => Promise<void>;

export type QueueCheckTaskClaimFn = (
  task_id: string,
  run_id: number,
  taken_until_in: Date
) => Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;

export type QueueClaimTaskFn = (
  task_id: string,
  run_id: number,
  worker_group: string,
  worker_id: string,
  hint_id: string,
  taken_until_in: Date
) => Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;

export type QueueCreateQueueArtifactFn = (
  task_id_in: string,
  run_id_in: number,
  name_in: string,
  storage_type_in: string,
  content_type_in: string,
  details_in: JsonB,
  present_in: boolean,
  expires_in: Date
) => Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;

/** @deprecated */
export type QueueCreateQueueProvisionerDeprecatedFn = (
  provisioner_id_in: string,
  expires_in: Date,
  last_date_active_in: Date,
  description_in: string,
  stability_in: string,
  actions_in: JsonB
) => Promise<string>;

/** @deprecated */
export type QueueCreateQueueWorkerDeprecatedFn = (
  provisioner_id_in: string,
  worker_type_in: string,
  worker_group_in: string,
  worker_id_in: string,
  quarantine_until_in: Date,
  expires_in: Date,
  first_claim_in: Date,
  recent_tasks_in: JsonB
) => Promise<string>;

/** @deprecated */
export type QueueCreateQueueWorkerTqidDeprecatedFn = (
  task_queue_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  quarantine_until_in: Date,
  expires_in: Date,
  first_claim_in: Date,
  recent_tasks_in: JsonB
) => Promise<string>;

/** @deprecated */
export type QueueCreateQueueWorkerTypeDeprecatedFn = (
  provisioner_id_in: string,
  worker_type_in: string,
  expires_in: Date,
  last_date_active_in: Date,
  description_in: string,
  stability_in: string
) => Promise<string>;

/** @deprecated */
export type QueueCreateTaskDeprecatedFn = (
  task_id: string,
  provisioner_id: string,
  worker_type: string,
  scheduler_id: string,
  task_group_id: string,
  dependencies: JsonB,
  requires: TaskRequires,
  routes: JsonB,
  priority: TaskPriority,
  retries: number,
  created: Date,
  deadline: Date,
  expires: Date,
  scopes: JsonB,
  payload: JsonB,
  metadata: JsonB,
  tags: JsonB,
  extra: JsonB
) => Promise<void>;

export type QueueCreateTaskProjidFn = (
  task_id: string,
  task_queue_id: string,
  scheduler_id: string,
  project_id: string,
  task_group_id: string,
  dependencies: JsonB,
  requires: TaskRequires,
  routes: JsonB,
  priority: TaskPriority,
  retries: number,
  created: Date,
  deadline: Date,
  expires: Date,
  scopes: JsonB,
  payload: JsonB,
  metadata: JsonB,
  tags: JsonB,
  extra: JsonB
) => Promise<void>;

/** @deprecated */
export type QueueCreateTaskQueueDeprecatedFn = (
  task_queue_id_in: string,
  expires_in: Date,
  last_date_active_in: Date,
  description_in: string,
  stability_in: string
) => Promise<string>;

/** @deprecated */
export type QueueCreateTaskTqidDeprecatedFn = (
  task_id: string,
  task_queue_id: string,
  scheduler_id: string,
  task_group_id: string,
  dependencies: JsonB,
  requires: TaskRequires,
  routes: JsonB,
  priority: TaskPriority,
  retries: number,
  created: Date,
  deadline: Date,
  expires: Date,
  scopes: JsonB,
  payload: JsonB,
  metadata: JsonB,
  tags: JsonB,
  extra: JsonB
) => Promise<void>;

export type QueueDeleteQueueArtifactFn = (
  task_id_in: string,
  run_id_in: number,
  name_in: string
) => Promise<void>;

export type QueueDeleteQueueArtifactsFn = (
  task_id_run_id_names: JsonB
) => Promise<void>;

export type QueueDeleteQueueProvisionerFn = (
  provisioner_id: string,
  stability: string,
  description: string
) => Promise<void>;

export type QueueDeleteQueueWorkerTypeFn = (
  provisioner_id: string,
  worker_type: string,
  stability: string,
  description: string
) => Promise<void>;

export type QueueEnsureTaskGroupFn = (
  task_group_id_in: string,
  scheduler_id_in: string,
  expires_in: Date
) => Promise<void>;

/** @deprecated */
export type QueueExpireQueueProvisionersDeprecatedFn = (
  expires_in: Date
) => Promise<number>;

/** @deprecated */
export type QueueExpireQueueWorkerTypesDeprecatedFn = (
  expires_in: Date
) => Promise<number>;

export type QueueExpireQueueWorkersFn = (
  expires_in: Date
) => Promise<number>;

export type QueueExpireTaskDependenciesFn = (
  expires_in: Date
) => Promise<number>;

export type QueueExpireTaskGroupsFn = (
  expires_in: Date
) => Promise<number>;

export type QueueExpireTaskQueuesFn = (
  expires_in: Date
) => Promise<number>;

export type QueueExpireTasksFn = (
  expires_in: Date
) => Promise<number>;

export type QueueGetClaimedTasksByTaskQueueIdFn = (
  task_queue_id_in: string,
  page_size_in: number,
  after_claimed_in: Date,
  after_task_id_in: string
) => Promise<void>;

export type QueueGetDependentTasksFn = (
  required_task_id_in: string,
  satisfied_in: boolean,
  tasks_after_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{dependent_task_id: string, requires: TaskRequires, satisfied: boolean}>>;

export type QueueGetExpiredArtifactsForDeletionFn = (
  expires_in: Date,
  page_size_in: number
) => Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;

export type QueueGetMultipleTasksFn = (
  tasks_in: JsonB,
  page_size_in: number,
  page_offset_in: number
) => Promise<void>;

export type QueueGetPendingTasksByTaskQueueIdFn = (
  task_queue_id_in: string,
  page_size_in: number,
  after_inserted_in: Date,
  after_task_id_in: string
) => Promise<void>;

export type QueueGetQueueArtifactFn = (
  task_id_in: string,
  run_id_in: number,
  name_in: string
) => Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;

/** @deprecated */
export type QueueGetQueueArtifactsDeprecatedFn = (
  task_id_in: string,
  run_id_in: number,
  expires_in: Date,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;

export type QueueGetQueueArtifactsPaginatedFn = (
  task_id_in: string,
  run_id_in: number,
  expires_in: Date,
  page_size_in: number,
  after_task_id_in: string,
  after_run_id_in: number,
  after_name_in: string
) => Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;

/** @deprecated */
export type QueueGetQueueProvisionerDeprecatedFn = (
  provisioner_id_in: string,
  expires_in: Date
) => Promise<Array<{provisioner_id: string, expires: Date, last_date_active: Date, description: string, stability: string, actions: JsonB, etag: string}>>;

/** @deprecated */
export type QueueGetQueueProvisionersDeprecatedFn = (
  expires_in: Date,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{provisioner_id: string, expires: Date, last_date_active: Date, description: string, stability: string, actions: JsonB, etag: string}>>;

/** @deprecated */
export type QueueGetQueueWorkerDeprecatedFn = (
  provisioner_id_in: string,
  worker_type_in: string,
  worker_group_in: string,
  worker_id_in: string,
  expires_in: Date
) => Promise<Array<{provisioner_id: string, worker_type: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;

/** @deprecated */
export type QueueGetQueueWorkerTqidDeprecatedFn = (
  task_queue_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  expires_in: Date
) => Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;

/** @deprecated */
export type QueueGetQueueWorkerTqidWithLastDateActiveDeprecatedFn = (
  task_queue_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  expires_in: Date
) => Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, etag: string}>>;

/** @deprecated */
export type QueueGetQueueWorkerTypeDeprecatedFn = (
  provisioner_id_in: string,
  worker_type_in: string,
  expires_in: Date
) => Promise<Array<{provisioner_id: string, worker_type: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;

/** @deprecated */
export type QueueGetQueueWorkerTypesDeprecatedFn = (
  provisioner_id_in: string,
  worker_type_in: string,
  expires_in: Date,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{provisioner_id: string, worker_type: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;

/** @deprecated */
export type QueueGetQueueWorkersDeprecatedFn = (
  provisioner_id_in: string,
  worker_type_in: string,
  expires_in: Date,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{provisioner_id: string, worker_type: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;

/** @deprecated */
export type QueueGetQueueWorkersTqidDeprecatedFn = (
  task_queue_id_in: string,
  expires_in: Date,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;

/** @deprecated */
export type QueueGetQueueWorkersTqidWithLastDateActiveDeprecatedFn = (
  task_queue_id_in: string,
  expires_in: Date,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, etag: string}>>;

/** @deprecated */
export type QueueGetTaskDeprecatedFn = (
  task_id_in: string
) => Promise<void>;

/** @deprecated */
export type QueueGetTaskGroupDeprecatedFn = (
  task_group_id_in: string
) => Promise<void>;

export type QueueGetTaskGroupSizeFn = (
  task_group_id_in: string
) => Promise<number>;

export type QueueGetTaskGroup2Fn = (
  task_group_id_in: string
) => Promise<void>;

export type QueueGetTaskProjidFn = (
  task_id_in: string
) => Promise<void>;

export type QueueGetTaskQueueFn = (
  task_queue_id_in: string,
  expires_in: Date
) => Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;

export type QueueGetTaskQueuesFn = (
  task_queue_id_in: string,
  expires_in: Date,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;

/** @deprecated */
export type QueueGetTaskTqidDeprecatedFn = (
  task_id_in: string
) => Promise<void>;

/** @deprecated */
export type QueueGetTasksByTaskGroupDeprecatedFn = (
  task_group_id_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<void>;

export type QueueGetTasksByTaskGroupProjidFn = (
  task_group_id_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<void>;

/** @deprecated */
export type QueueGetTasksByTaskGroupTqidDeprecatedFn = (
  task_group_id_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<void>;

export type QueueIsTaskBlockedFn = (
  dependent_task_id_in: string
) => Promise<boolean>;

export type QueueIsTaskGroupActiveFn = (
  task_group_id_in: string
) => Promise<boolean>;

export type QueueIsTaskGroupSealedFn = (
  task_group_id_in: string
) => Promise<boolean>;

export type QueueMarkTaskEverResolvedFn = (
  task_id_in: string
) => Promise<void>;

/** @deprecated */
export type QueueQuarantineQueueWorkerDeprecatedFn = (
  task_queue_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  quarantine_until_in: Date
) => Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB}>>;

/** @deprecated */
export type QueueQuarantineQueueWorkerWithLastDateActiveDeprecatedFn = (
  task_queue_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  quarantine_until_in: Date
) => Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date}>>;

export type QueueQuarantineQueueWorkerWithLastDateActiveAndDetailsFn = (
  task_queue_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  quarantine_until_in: Date,
  quarantine_details_in: JsonB
) => Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, quarantine_details: JsonB}>>;

export type QueueQueueArtifactPresentFn = (
  task_id_in: string,
  run_id_in: number,
  name_in: string
) => Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;

/** @deprecated */
export type QueueQueueArtifactsEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type QueueQueueArtifactsEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueArtifactsEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueArtifactsEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueArtifactsEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type QueueQueueClaimedTaskDeleteFn = (
  task_id_in: string,
  pop_receipt_in: string
) => Promise<void>;

export type QueueQueueClaimedTaskGetFn = (
  visible_in: Date,
  count: number
) => Promise<Array<{task_id: string, run_id: number, taken_until: Date, pop_receipt: string}>>;

export type QueueQueueClaimedTaskPutFn = (
  task_id_in: string,
  run_id_in: number,
  taken_until_in: Date,
  task_queue_id_in: string,
  worker_group_in: string,
  worker_id_in: string
) => Promise<void>;

export type QueueQueueClaimedTaskResolvedFn = (
  task_id_in: string,
  run_id_in: number
) => Promise<void>;

export type QueueQueueClaimedTasksCountFn = (
  task_queue_id_in: string
) => Promise<number>;

export type QueueQueuePendingTaskDeleteFn = (
  task_id_in: string,
  run_id_in: number
) => Promise<void>;

export type QueueQueuePendingTasksAddFn = (
  task_queue_id_in: string,
  priority_in: number,
  task_id_in: string,
  run_id_in: number,
  hint_id_in: string,
  expires_in: any
) => Promise<void>;

export type QueueQueuePendingTasksCountFn = (
  task_queue_id_in: string
) => Promise<number>;

export type QueueQueuePendingTasksDeleteFn = (
  task_id_in: string,
  pop_receipt_in: string
) => Promise<void>;

export type QueueQueuePendingTasksDeleteExpiredFn = (
) => Promise<void>;

export type QueueQueuePendingTasksGetFn = (
  task_queue_id_in: string,
  visible_in: Date,
  count: number
) => Promise<Array<{task_id: string, run_id: number, hint_id: string, pop_receipt: string}>>;

/** @deprecated */
export type QueueQueuePendingTasksPutDeprecatedFn = (
  task_queue_id_in: string,
  priority_in: number,
  task_id_in: string,
  run_id_in: number,
  hint_id_in: string,
  expires_in: any,
  queue_name_compat_in: string
) => Promise<void>;

export type QueueQueuePendingTasksReleaseFn = (
  task_id_in: string,
  pop_receipt_in: string
) => Promise<void>;

/** @deprecated */
export type QueueQueueProvisionerEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type QueueQueueProvisionerEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueProvisionerEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueProvisionerEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueProvisionerEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type QueueQueueResolvedTaskDeleteFn = (
  task_id_in: string,
  pop_receipt_in: string
) => Promise<void>;

export type QueueQueueResolvedTaskGetFn = (
  visible_in: Date,
  count: number
) => Promise<Array<{task_id: string, task_group_id: string, scheduler_id: string, resolution: string, pop_receipt: string}>>;

export type QueueQueueResolvedTaskPutFn = (
  task_group_id_in: string,
  task_id_in: string,
  scheduler_id_in: string,
  resolution_in: string
) => Promise<void>;

export type QueueQueueTaskDeadlineDeleteFn = (
  task_id_in: string,
  pop_receipt_in: string
) => Promise<void>;

export type QueueQueueTaskDeadlineGetFn = (
  visible_in: Date,
  count: number
) => Promise<Array<{task_id: string, task_group_id: string, scheduler_id: string, deadline: Date, pop_receipt: string}>>;

export type QueueQueueTaskDeadlinePutFn = (
  task_group_id_in: string,
  task_id_in: string,
  scheduler_id_in: string,
  deadline_in: Date,
  visible: Date
) => Promise<void>;

/** @deprecated */
export type QueueQueueTaskDeadlineResolvedDeprecatedFn = (
  task_id_in: string
) => Promise<void>;

/** @deprecated */
export type QueueQueueTaskDependencyEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type QueueQueueTaskDependencyEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueTaskDependencyEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueTaskDependencyEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueTaskDependencyEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueTaskGroupActiveSetsEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type QueueQueueTaskGroupActiveSetsEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueTaskGroupActiveSetsEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueTaskGroupActiveSetsEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueTaskGroupActiveSetsEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueTaskGroupMembersEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type QueueQueueTaskGroupMembersEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueTaskGroupMembersEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueTaskGroupMembersEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueTaskGroupMembersEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueTaskGroupsEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type QueueQueueTaskGroupsEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueTaskGroupsEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueTaskGroupsEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueTaskGroupsEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueTaskRequirementEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type QueueQueueTaskRequirementEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueTaskRequirementEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueTaskRequirementEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueTaskRequirementEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueTasksEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type QueueQueueTasksEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueTasksEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueTasksEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueTasksEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueWorkerEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type QueueQueueWorkerEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueWorkerEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueWorkerEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueWorkerEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueWorkerSeenDeprecatedFn = (
  task_queue_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  expires_in: Date
) => Promise<void>;

export type QueueQueueWorkerSeenWithLastDateActiveFn = (
  task_queue_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  expires_in: Date
) => Promise<void>;

export type QueueQueueWorkerTaskSeenFn = (
  task_queue_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  task_run_in: JsonB
) => Promise<void>;

/** @deprecated */
export type QueueQueueWorkerTypeEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type QueueQueueWorkerTypeEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type QueueQueueWorkerTypeEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueWorkerTypeEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type QueueQueueWorkerTypeEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type QueueReclaimTaskFn = (
  task_id: string,
  run_id: number,
  taken_until_in: Date
) => Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;

export type QueueRemoveTaskFn = (
  task_id: string
) => Promise<void>;

export type QueueRemoveTaskDependenciesFn = (
  dependent_task_id_in: string,
  required_task_ids_in: JsonB
) => Promise<void>;

export type QueueRemoveTaskDependencyFn = (
  dependent_task_id_in: string,
  required_task_id_in: string
) => Promise<void>;

export type QueueRerunTaskFn = (
  task_id: string
) => Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;

export type QueueResolveTaskFn = (
  task_id: string,
  run_id: number,
  state: string,
  reason: string,
  retry_reason: string
) => Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;

export type QueueResolveTaskAtDeadlineFn = (
  task_id: string
) => Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;

export type QueueSatisfyTaskDependencyFn = (
  dependent_task_id_in: string,
  required_task_id_in: string
) => Promise<void>;

export type QueueScheduleTaskFn = (
  task_id: string,
  reason_created: string
) => Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;

export type QueueSealTaskGroupFn = (
  task_group_id_in: string
) => Promise<void>;

export type QueueTaskQueueSeenFn = (
  task_queue_id_in: string,
  expires_in: Date,
  description_in: string,
  stability_in: string
) => Promise<void>;

/** @deprecated */
export type QueueUpdateQueueArtifactDeprecatedFn = (
  task_id_in: string,
  run_id_in: number,
  name_in: string,
  details_in: JsonB,
  expires_in: Date
) => Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;

export type QueueUpdateQueueArtifact2Fn = (
  task_id_in: string,
  run_id_in: number,
  name_in: string,
  storage_type_in: string,
  details_in: JsonB,
  expires_in: Date
) => Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;

/** @deprecated */
export type QueueUpdateQueueProvisionerDeprecatedFn = (
  provisioner_id_in: string,
  expires_in: Date,
  last_date_active_in: Date,
  description_in: string,
  stability_in: string,
  actions_in: JsonB
) => Promise<Array<{provisioner_id: string, expires: Date, last_date_active: Date, description: string, stability: string, actions: JsonB, etag: string}>>;

/** @deprecated */
export type QueueUpdateQueueWorkerDeprecatedFn = (
  provisioner_id_in: string,
  worker_type_in: string,
  worker_group_in: string,
  worker_id_in: string,
  quarantine_until_in: Date,
  expires_in: Date,
  recent_tasks_in: JsonB
) => Promise<Array<{provisioner_id: string, worker_type: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;

/** @deprecated */
export type QueueUpdateQueueWorkerTqidDeprecatedFn = (
  task_queue_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  quarantine_until_in: Date,
  expires_in: Date,
  recent_tasks_in: JsonB
) => Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;

/** @deprecated */
export type QueueUpdateQueueWorkerTypeDeprecatedFn = (
  provisioner_id_in: string,
  worker_type_in: string,
  expires_in: Date,
  last_date_active_in: Date,
  description_in: string,
  stability_in: string
) => Promise<Array<{provisioner_id: string, worker_type: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;

/** @deprecated */
export type QueueUpdateTaskQueueDeprecatedFn = (
  task_queue_id_in: string,
  expires_in: Date,
  last_date_active_in: Date,
  description_in: string,
  stability_in: string
) => Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;

// secrets function signatures

export type SecretsDeleteSecretFn = (
  name_in: string
) => Promise<void>;

export type SecretsExpireSecretsFn = (
) => Promise<number>;

export type SecretsGetSecretFn = (
  name_in: string
) => Promise<Array<{name: string, encrypted_secret: JsonB, expires: Date}>>;

export type SecretsGetSecretsFn = (
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{name: string}>>;

/** @deprecated */
export type SecretsSecretsEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type SecretsSecretsEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type SecretsSecretsEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type SecretsSecretsEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type SecretsSecretsEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type SecretsUpsertSecretFn = (
  name_in: string,
  encrypted_secret_in: JsonB,
  expires_in: Date
) => Promise<void>;

// web_server function signatures

/** @deprecated */
export type WebServerAccessTokenTableEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type WebServerAccessTokenTableEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type WebServerAccessTokenTableEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type WebServerAccessTokenTableEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type WebServerAccessTokenTableEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type WebServerAddGithubAccessTokenFn = (
  user_id_in: string,
  encrypted_access_token_in: JsonB
) => Promise<void>;

/** @deprecated */
export type WebServerAuthorizationCodesTableEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type WebServerAuthorizationCodesTableEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type WebServerAuthorizationCodesTableEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type WebServerAuthorizationCodesTableEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type WebServerAuthorizationCodesTableEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type WebServerCreateAccessTokenFn = (
  hashed_access_token_in: string,
  encrypted_access_token_in: JsonB,
  client_id_in: string,
  redirect_uri_in: string,
  identity_in: string,
  identity_provider_id_in: string,
  expires_in: Date,
  client_details_in: JsonB
) => Promise<Array<{hashed_access_token: string, encrypted_access_token: JsonB, client_id: string, redirect_uri: string, identity: string, identity_provider_id: string, expires: Date, client_details: JsonB}>>;

export type WebServerCreateAuthorizationCodeFn = (
  code_in: string,
  client_id_in: string,
  redirect_uri_in: string,
  identity_in: string,
  identity_provider_id_in: string,
  expires_in: Date,
  client_details_in: JsonB
) => Promise<Array<{code: string, client_id: string, redirect_uri: string, identity: string, identity_provider_id: string, expires: Date, client_details: JsonB}>>;

export type WebServerExpireAccessTokensFn = (
  expires_in: Date
) => Promise<number>;

export type WebServerExpireAuthorizationCodesFn = (
  expires_in: Date
) => Promise<number>;

export type WebServerExpireSessionsFn = (
) => Promise<number>;

export type WebServerGetAccessTokenFn = (
  hashed_access_token_in: string
) => Promise<Array<{hashed_access_token: string, encrypted_access_token: JsonB, client_id: string, redirect_uri: string, identity: string, identity_provider_id: string, expires: Date, client_details: JsonB}>>;

export type WebServerGetAuthorizationCodeFn = (
  code_in: string
) => Promise<Array<{code: string, client_id: string, redirect_uri: string, identity: string, identity_provider_id: string, expires: Date, client_details: JsonB}>>;

/** @deprecated */
export type WebServerGithubAccessTokenTableEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type WebServerGithubAccessTokenTableEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type WebServerGithubAccessTokenTableEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type WebServerGithubAccessTokenTableEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type WebServerGithubAccessTokenTableEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type WebServerLoadGithubAccessTokenFn = (
  user_id_in: string
) => Promise<Array<{encrypted_access_token: JsonB}>>;

export type WebServerSessionAddFn = (
  hashed_session_id_in: string,
  encrypted_session_id_in: JsonB,
  data_in: JsonB,
  expires_in: Date
) => Promise<void>;

export type WebServerSessionLoadFn = (
  hashed_session_id_in: string
) => Promise<Array<{hashed_session_id: string, encrypted_session_id: JsonB, data: JsonB, expires: Date}>>;

export type WebServerSessionRemoveFn = (
  hashed_session_id_in: string
) => Promise<void>;

/** @deprecated */
export type WebServerSessionStorageTableEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type WebServerSessionStorageTableEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type WebServerSessionStorageTableEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type WebServerSessionStorageTableEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type WebServerSessionStorageTableEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export type WebServerSessionTouchFn = (
  hashed_session_id_in: string,
  data_in: JsonB,
  expires_in: Date
) => Promise<void>;

// worker_manager function signatures

export type WorkerManagerCreateWorkerFn = (
  worker_pool_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  provider_id_in: string,
  created_in: Date,
  expires_in: Date,
  state_in: string,
  provider_data_in: JsonB,
  capacity_in: number,
  last_modified_in: Date,
  last_checked_in: Date
) => Promise<string>;

export type WorkerManagerCreateWorkerPoolFn = (
  worker_pool_id_in: string,
  provider_id_in: string,
  previous_provider_ids_in: JsonB,
  description_in: string,
  config_in: JsonB,
  created_in: Date,
  last_modified_in: Date,
  owner_in: string,
  email_on_error_in: boolean,
  provider_data_in: JsonB
) => Promise<void>;

export type WorkerManagerCreateWorkerPoolErrorFn = (
  error_id_in: string,
  worker_pool_id_in: string,
  reported_in: Date,
  kind_in: string,
  title_in: string,
  description_in: string,
  extra_in: JsonB
) => Promise<string>;

export type WorkerManagerDeleteWorkerFn = (
  worker_pool_id_in: string,
  worker_group_in: string,
  worker_id_in: string
) => Promise<void>;

export type WorkerManagerDeleteWorkerPoolFn = (
  worker_pool_id_in: string
) => Promise<void>;

export type WorkerManagerDeleteWorkerPoolErrorFn = (
  error_id_in: string,
  worker_pool_id_in: string
) => Promise<void>;

export type WorkerManagerExpireWorkerPoolErrorsFn = (
  expires_in: Date
) => Promise<number>;

export type WorkerManagerExpireWorkerPoolsFn = (
) => Promise<Array<{worker_pool_id: string}>>;

export type WorkerManagerExpireWorkersFn = (
  expires_in: Date
) => Promise<number>;

/** @deprecated */
export type WorkerManagerGetNonStoppedWorkersDeprecatedFn = (
  worker_pool_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date}>>;

/** @deprecated */
export type WorkerManagerGetNonStoppedWorkers2DeprecatedFn = (
  worker_pool_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string}>>;

/** @deprecated */
export type WorkerManagerGetNonStoppedWorkersQuntilDeprecatedFn = (
  worker_pool_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string, quarantine_until: Date}>>;

/** @deprecated */
export type WorkerManagerGetNonStoppedWorkersQuntilProvidersDeprecatedFn = (
  worker_pool_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  providers_filter_cond: string,
  providers_filter_value: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string, quarantine_until: Date}>>;

export type WorkerManagerGetNonStoppedWorkersScannerFn = (
  worker_pool_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  providers_filter_cond: string,
  providers_filter_value: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string, quarantine_until: Date, first_claim: Date, last_date_active: Date}>>;

/** @deprecated */
export type WorkerManagerGetQueueWorkerWithWmJoinDeprecatedFn = (
  task_queue_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  expires_in: Date
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;

export type WorkerManagerGetQueueWorkerWithWmJoin2Fn = (
  task_queue_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  expires_in: Date
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, quarantine_details: JsonB, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;

export type WorkerManagerGetQueueWorkersWithWmJoinFn = (
  task_queue_id_in: string,
  expires_in: Date,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;

/** @deprecated */
export type WorkerManagerGetQueueWorkersWithWmJoinQuarantinedDeprecatedFn = (
  task_queue_id_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;

export type WorkerManagerGetQueueWorkersWithWmJoinQuarantined2Fn = (
  task_queue_id_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;

export type WorkerManagerGetQueueWorkersWithWmJoinStateFn = (
  task_queue_id_in: string,
  expires_in: Date,
  page_size_in: number,
  page_offset_in: number,
  worker_state_in: string
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;

/** @deprecated */
export type WorkerManagerGetTaskQueueWmDeprecatedFn = (
  task_queue_id_in: string,
  expires_in: Date,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;

export type WorkerManagerGetTaskQueueWm2Fn = (
  task_queue_id_in: string,
  expires_in: Date
) => Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;

export type WorkerManagerGetTaskQueuesWmFn = (
  task_queue_id_in: string,
  expires_in: Date,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;

/** @deprecated */
export type WorkerManagerGetWorkerDeprecatedFn = (
  worker_pool_id_in: string,
  worker_group_in: string,
  worker_id_in: string
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, etag: string}>>;

export type WorkerManagerGetWorker2Fn = (
  worker_pool_id_in: string,
  worker_group_in: string,
  worker_id_in: string
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string}>>;

export type WorkerManagerGetWorkerManagerWorkersFn = (
  worker_pool_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  state_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, capacity: number, last_modified: Date, last_checked: Date}>>;

/** @deprecated */
export type WorkerManagerGetWorkerPoolDeprecatedFn = (
  worker_pool_id_in: string
) => Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB}>>;

export type WorkerManagerGetWorkerPoolErrorFn = (
  error_id_in: string,
  worker_pool_id_in: string
) => Promise<Array<{error_id: string, worker_pool_id: string, reported: Date, kind: string, title: string, description: string, extra: JsonB}>>;

export type WorkerManagerGetWorkerPoolErrorCodesFn = (
  worker_pool_id_in: string
) => Promise<Array<{code: string, count: number}>>;

export type WorkerManagerGetWorkerPoolErrorStatsLast24HoursFn = (
  worker_pool_id_in: string
) => Promise<Array<{hour: Date, count: number}>>;

export type WorkerManagerGetWorkerPoolErrorStatsLast7DaysFn = (
  worker_pool_id_in: string
) => Promise<Array<{day: Date, count: number}>>;

export type WorkerManagerGetWorkerPoolErrorTitlesFn = (
  worker_pool_id_in: string
) => Promise<Array<{title: string, count: number}>>;

export type WorkerManagerGetWorkerPoolErrorWorkerPoolsFn = (
  worker_pool_id_in: string
) => Promise<Array<{worker_pool: string, count: number}>>;

/** @deprecated */
export type WorkerManagerGetWorkerPoolErrorsDeprecatedFn = (
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{error_id: string, worker_pool_id: string, reported: Date, kind: string, title: string, description: string, extra: JsonB}>>;

export type WorkerManagerGetWorkerPoolErrorsForWorkerPoolFn = (
  error_id_in: string,
  worker_pool_id_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{error_id: string, worker_pool_id: string, reported: Date, kind: string, title: string, description: string, extra: JsonB}>>;

/** @deprecated */
export type WorkerManagerGetWorkerPoolWithCapacityDeprecatedFn = (
  worker_pool_id_in: string
) => Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB, current_capacity: number}>>;

export type WorkerManagerGetWorkerPoolWithCapacityAndCountsByStateFn = (
  worker_pool_id_in: string
) => Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB, current_capacity: number, requested_count: number, running_count: number, stopping_count: number, stopped_count: number, requested_capacity: number, running_capacity: number, stopping_capacity: number, stopped_capacity: number}>>;

/** @deprecated */
export type WorkerManagerGetWorkerPoolsDeprecatedFn = (
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB}>>;

/** @deprecated */
export type WorkerManagerGetWorkerPoolsWithCapacityDeprecatedFn = (
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB, current_capacity: number}>>;

export type WorkerManagerGetWorkerPoolsWithCapacityAndCountsByStateFn = (
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB, current_capacity: number, requested_count: number, running_count: number, stopping_count: number, stopped_count: number, requested_capacity: number, running_capacity: number, stopping_capacity: number, stopped_capacity: number}>>;

/** @deprecated */
export type WorkerManagerGetWorkersDeprecatedFn = (
  worker_pool_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  state_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date}>>;

/** @deprecated */
export type WorkerManagerGetWorkersWithoutProviderDataDeprecatedFn = (
  worker_pool_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  state_in: string,
  page_size_in: number,
  page_offset_in: number
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, capacity: number, last_modified: Date, last_checked: Date}>>;

export type WorkerManagerRemoveWorkerPoolPreviousProviderIdFn = (
  worker_pool_id_in: string,
  provider_id_in: string
) => Promise<void>;

/** @deprecated */
export type WorkerManagerUpdateWorkerDeprecatedFn = (
  worker_pool_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  provider_id_in: string,
  created_in: Date,
  expires_in: Date,
  state_in: string,
  provider_data_in: JsonB,
  capacity_in: number,
  last_modified_in: Date,
  last_checked_in: Date,
  etag_in: string
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, etag: string}>>;

export type WorkerManagerUpdateWorker2Fn = (
  worker_pool_id_in: string,
  worker_group_in: string,
  worker_id_in: string,
  provider_id_in: string,
  created_in: Date,
  expires_in: Date,
  state_in: string,
  provider_data_in: JsonB,
  capacity_in: number,
  last_modified_in: Date,
  last_checked_in: Date,
  etag_in: string,
  secret_in: JsonB
) => Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, etag: string, secret: JsonB}>>;

/** @deprecated */
export type WorkerManagerUpdateWorkerPoolDeprecatedFn = (
  worker_pool_id_in: string,
  provider_id_in: string,
  description_in: string,
  config_in: JsonB,
  last_modified_in: Date,
  owner_in: string,
  email_on_error_in: boolean
) => Promise<Array<{worker_pool_id: string, provider_id: string, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, previous_provider_id: string}>>;

export type WorkerManagerUpdateWorkerPoolProviderDataFn = (
  worker_pool_id_in: string,
  provider_id_in: string,
  provider_data_in: JsonB
) => Promise<void>;

/** @deprecated */
export type WorkerManagerUpdateWorkerPoolWithCapacityDeprecatedFn = (
  worker_pool_id_in: string,
  provider_id_in: string,
  description_in: string,
  config_in: JsonB,
  last_modified_in: Date,
  owner_in: string,
  email_on_error_in: boolean
) => Promise<Array<{worker_pool_id: string, provider_id: string, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, previous_provider_id: string, current_capacity: number}>>;

export type WorkerManagerUpdateWorkerPoolWithCapacityAndCountsByStateFn = (
  worker_pool_id_in: string,
  provider_id_in: string,
  description_in: string,
  config_in: JsonB,
  last_modified_in: Date,
  owner_in: string,
  email_on_error_in: boolean
) => Promise<Array<{worker_pool_id: string, provider_id: string, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, previous_provider_id: string, current_capacity: number, requested_count: number, running_count: number, stopping_count: number, stopped_count: number, requested_capacity: number, running_capacity: number, stopping_capacity: number, stopped_capacity: number}>>;

/** @deprecated */
export type WorkerManagerWmworkerPoolErrorsEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type WorkerManagerWmworkerPoolErrorsEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type WorkerManagerWmworkerPoolErrorsEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type WorkerManagerWmworkerPoolErrorsEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type WorkerManagerWmworkerPoolErrorsEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type WorkerManagerWmworkerPoolsEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type WorkerManagerWmworkerPoolsEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type WorkerManagerWmworkerPoolsEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type WorkerManagerWmworkerPoolsEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type WorkerManagerWmworkerPoolsEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type WorkerManagerWmworkersEntitiesCreateDeprecatedFn = (
  pk: string,
  rk: string,
  properties: JsonB,
  overwrite: boolean,
  version: number
) => Promise<string>;

/** @deprecated */
export type WorkerManagerWmworkersEntitiesLoadDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;

/** @deprecated */
export type WorkerManagerWmworkersEntitiesModifyDeprecatedFn = (
  partition_key: string,
  row_key: string,
  properties: JsonB,
  version: number,
  old_etag: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type WorkerManagerWmworkersEntitiesRemoveDeprecatedFn = (
  partition_key: string,
  row_key: string
) => Promise<Array<{etag: string}>>;

/** @deprecated */
export type WorkerManagerWmworkersEntitiesScanDeprecatedFn = (
  pk: string,
  rk: string,
  condition: string,
  size: number,
  page: number
) => Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;

export interface DbFunctions {

  // Auth
  create_client: AuthCreateClientFn;
  delete_client: AuthDeleteClientFn;
  expire_clients: AuthExpireClientsFn;
  get_client: AuthGetClientFn;
  get_clients: AuthGetClientsFn;
  get_roles: AuthGetRolesFn;
  modify_roles: AuthModifyRolesFn;
  update_client: AuthUpdateClientFn;
  update_client_last_used: AuthUpdateClientLastUsedFn;

  // Github
  create_github_build_pr: GithubCreateGithubBuildPrFn;
  create_github_check: GithubCreateGithubCheckFn;
  delete_github_build: GithubDeleteGithubBuildFn;
  get_github_build_pr: GithubGetGithubBuildPrFn;
  get_github_builds_pr: GithubGetGithubBuildsPrFn;
  get_github_check_by_run_id: GithubGetGithubCheckByRunIdFn;
  get_github_check_by_task_group_and_task_id: GithubGetGithubCheckByTaskGroupAndTaskIdFn;
  get_github_checks_by_task_group_id: GithubGetGithubChecksByTaskGroupIdFn;
  get_github_integration: GithubGetGithubIntegrationFn;
  get_github_integrations: GithubGetGithubIntegrationsFn;
  get_pending_github_builds: GithubGetPendingGithubBuildsFn;
  set_github_build_state: GithubSetGithubBuildStateFn;
  upsert_github_integration: GithubUpsertGithubIntegrationFn;

  // Hooks
  create_hook: HooksCreateHookFn;
  create_hooks_queue: HooksCreateHooksQueueFn;
  create_last_fire: HooksCreateLastFireFn;
  delete_hook: HooksDeleteHookFn;
  delete_hooks_queue: HooksDeleteHooksQueueFn;
  delete_last_fires: HooksDeleteLastFiresFn;
  expire_last_fires: HooksExpireLastFiresFn;
  get_hook: HooksGetHookFn;
  get_hooks: HooksGetHooksFn;
  get_hooks_queues: HooksGetHooksQueuesFn;
  get_last_fire: HooksGetLastFireFn;
  get_last_fires_with_task_state: HooksGetLastFiresWithTaskStateFn;
  update_hook: HooksUpdateHookFn;
  update_hooks_queue_bindings: HooksUpdateHooksQueueBindingsFn;

  // Index
  create_index_namespace: IndexCreateIndexNamespaceFn;
  create_indexed_task: IndexCreateIndexedTaskFn;
  delete_indexed_task: IndexDeleteIndexedTaskFn;
  expire_index_namespaces: IndexExpireIndexNamespacesFn;
  expire_indexed_tasks: IndexExpireIndexedTasksFn;
  get_index_namespace: IndexGetIndexNamespaceFn;
  get_index_namespaces: IndexGetIndexNamespacesFn;
  get_indexed_task: IndexGetIndexedTaskFn;
  get_indexed_tasks: IndexGetIndexedTasksFn;
  get_tasks_from_indexes_and_namespaces: IndexGetTasksFromIndexesAndNamespacesFn;
  update_index_namespace: IndexUpdateIndexNamespaceFn;
  update_indexed_task: IndexUpdateIndexedTaskFn;

  // Notify
  add_denylist_address: NotifyAddDenylistAddressFn;
  all_denylist_addresses: NotifyAllDenylistAddressesFn;
  delete_denylist_address: NotifyDeleteDenylistAddressFn;
  exists_denylist_address: NotifyExistsDenylistAddressFn;

  // Object
  add_object_hashes: ObjectAddObjectHashesFn;
  create_object_for_upload: ObjectCreateObjectForUploadFn;
  delete_object: ObjectDeleteObjectFn;
  get_expired_objects: ObjectGetExpiredObjectsFn;
  get_object_hashes: ObjectGetObjectHashesFn;
  get_object_with_upload: ObjectGetObjectWithUploadFn;
  object_upload_complete: ObjectObjectUploadCompleteFn;

  // PurgeCache
  all_purge_requests_wpid: PurgeCacheAllPurgeRequestsWpidFn;
  expire_cache_purges: PurgeCacheExpireCachePurgesFn;
  purge_cache_wpid: PurgeCachePurgeCacheWpidFn;
  purge_requests_wpid: PurgeCachePurgeRequestsWpidFn;

  // Queue
  add_task_dependencies: QueueAddTaskDependenciesFn;
  add_task_dependency: QueueAddTaskDependencyFn;
  cancel_task: QueueCancelTaskFn;
  cancel_task_group: QueueCancelTaskGroupFn;
  check_task_claim: QueueCheckTaskClaimFn;
  claim_task: QueueClaimTaskFn;
  create_queue_artifact: QueueCreateQueueArtifactFn;
  create_task_projid: QueueCreateTaskProjidFn;
  delete_queue_artifact: QueueDeleteQueueArtifactFn;
  delete_queue_artifacts: QueueDeleteQueueArtifactsFn;
  delete_queue_provisioner: QueueDeleteQueueProvisionerFn;
  delete_queue_worker_type: QueueDeleteQueueWorkerTypeFn;
  ensure_task_group: QueueEnsureTaskGroupFn;
  expire_queue_workers: QueueExpireQueueWorkersFn;
  expire_task_dependencies: QueueExpireTaskDependenciesFn;
  expire_task_groups: QueueExpireTaskGroupsFn;
  expire_task_queues: QueueExpireTaskQueuesFn;
  expire_tasks: QueueExpireTasksFn;
  get_claimed_tasks_by_task_queue_id: QueueGetClaimedTasksByTaskQueueIdFn;
  get_dependent_tasks: QueueGetDependentTasksFn;
  get_expired_artifacts_for_deletion: QueueGetExpiredArtifactsForDeletionFn;
  get_multiple_tasks: QueueGetMultipleTasksFn;
  get_pending_tasks_by_task_queue_id: QueueGetPendingTasksByTaskQueueIdFn;
  get_queue_artifact: QueueGetQueueArtifactFn;
  get_queue_artifacts_paginated: QueueGetQueueArtifactsPaginatedFn;
  get_task_group_size: QueueGetTaskGroupSizeFn;
  get_task_group2: QueueGetTaskGroup2Fn;
  get_task_projid: QueueGetTaskProjidFn;
  get_task_queue: QueueGetTaskQueueFn;
  get_task_queues: QueueGetTaskQueuesFn;
  get_tasks_by_task_group_projid: QueueGetTasksByTaskGroupProjidFn;
  is_task_blocked: QueueIsTaskBlockedFn;
  is_task_group_active: QueueIsTaskGroupActiveFn;
  is_task_group_sealed: QueueIsTaskGroupSealedFn;
  mark_task_ever_resolved: QueueMarkTaskEverResolvedFn;
  quarantine_queue_worker_with_last_date_active_and_details: QueueQuarantineQueueWorkerWithLastDateActiveAndDetailsFn;
  queue_artifact_present: QueueQueueArtifactPresentFn;
  queue_claimed_task_delete: QueueQueueClaimedTaskDeleteFn;
  queue_claimed_task_get: QueueQueueClaimedTaskGetFn;
  queue_claimed_task_put: QueueQueueClaimedTaskPutFn;
  queue_claimed_task_resolved: QueueQueueClaimedTaskResolvedFn;
  queue_claimed_tasks_count: QueueQueueClaimedTasksCountFn;
  queue_pending_task_delete: QueueQueuePendingTaskDeleteFn;
  queue_pending_tasks_add: QueueQueuePendingTasksAddFn;
  queue_pending_tasks_count: QueueQueuePendingTasksCountFn;
  queue_pending_tasks_delete: QueueQueuePendingTasksDeleteFn;
  queue_pending_tasks_delete_expired: QueueQueuePendingTasksDeleteExpiredFn;
  queue_pending_tasks_get: QueueQueuePendingTasksGetFn;
  queue_pending_tasks_release: QueueQueuePendingTasksReleaseFn;
  queue_resolved_task_delete: QueueQueueResolvedTaskDeleteFn;
  queue_resolved_task_get: QueueQueueResolvedTaskGetFn;
  queue_resolved_task_put: QueueQueueResolvedTaskPutFn;
  queue_task_deadline_delete: QueueQueueTaskDeadlineDeleteFn;
  queue_task_deadline_get: QueueQueueTaskDeadlineGetFn;
  queue_task_deadline_put: QueueQueueTaskDeadlinePutFn;
  queue_worker_seen_with_last_date_active: QueueQueueWorkerSeenWithLastDateActiveFn;
  queue_worker_task_seen: QueueQueueWorkerTaskSeenFn;
  reclaim_task: QueueReclaimTaskFn;
  remove_task: QueueRemoveTaskFn;
  remove_task_dependencies: QueueRemoveTaskDependenciesFn;
  remove_task_dependency: QueueRemoveTaskDependencyFn;
  rerun_task: QueueRerunTaskFn;
  resolve_task: QueueResolveTaskFn;
  resolve_task_at_deadline: QueueResolveTaskAtDeadlineFn;
  satisfy_task_dependency: QueueSatisfyTaskDependencyFn;
  schedule_task: QueueScheduleTaskFn;
  seal_task_group: QueueSealTaskGroupFn;
  task_queue_seen: QueueTaskQueueSeenFn;
  update_queue_artifact_2: QueueUpdateQueueArtifact2Fn;

  // Secrets
  delete_secret: SecretsDeleteSecretFn;
  expire_secrets: SecretsExpireSecretsFn;
  get_secret: SecretsGetSecretFn;
  get_secrets: SecretsGetSecretsFn;
  upsert_secret: SecretsUpsertSecretFn;

  // WebServer
  add_github_access_token: WebServerAddGithubAccessTokenFn;
  create_access_token: WebServerCreateAccessTokenFn;
  create_authorization_code: WebServerCreateAuthorizationCodeFn;
  expire_access_tokens: WebServerExpireAccessTokensFn;
  expire_authorization_codes: WebServerExpireAuthorizationCodesFn;
  expire_sessions: WebServerExpireSessionsFn;
  get_access_token: WebServerGetAccessTokenFn;
  get_authorization_code: WebServerGetAuthorizationCodeFn;
  load_github_access_token: WebServerLoadGithubAccessTokenFn;
  session_add: WebServerSessionAddFn;
  session_load: WebServerSessionLoadFn;
  session_remove: WebServerSessionRemoveFn;
  session_touch: WebServerSessionTouchFn;

  // WorkerManager
  create_worker: WorkerManagerCreateWorkerFn;
  create_worker_pool: WorkerManagerCreateWorkerPoolFn;
  create_worker_pool_error: WorkerManagerCreateWorkerPoolErrorFn;
  delete_worker: WorkerManagerDeleteWorkerFn;
  delete_worker_pool: WorkerManagerDeleteWorkerPoolFn;
  delete_worker_pool_error: WorkerManagerDeleteWorkerPoolErrorFn;
  expire_worker_pool_errors: WorkerManagerExpireWorkerPoolErrorsFn;
  expire_worker_pools: WorkerManagerExpireWorkerPoolsFn;
  expire_workers: WorkerManagerExpireWorkersFn;
  get_non_stopped_workers_scanner: WorkerManagerGetNonStoppedWorkersScannerFn;
  get_queue_worker_with_wm_join_2: WorkerManagerGetQueueWorkerWithWmJoin2Fn;
  get_queue_workers_with_wm_join: WorkerManagerGetQueueWorkersWithWmJoinFn;
  get_queue_workers_with_wm_join_quarantined_2: WorkerManagerGetQueueWorkersWithWmJoinQuarantined2Fn;
  get_queue_workers_with_wm_join_state: WorkerManagerGetQueueWorkersWithWmJoinStateFn;
  get_task_queue_wm_2: WorkerManagerGetTaskQueueWm2Fn;
  get_task_queues_wm: WorkerManagerGetTaskQueuesWmFn;
  get_worker_2: WorkerManagerGetWorker2Fn;
  get_worker_manager_workers: WorkerManagerGetWorkerManagerWorkersFn;
  get_worker_pool_error: WorkerManagerGetWorkerPoolErrorFn;
  get_worker_pool_error_codes: WorkerManagerGetWorkerPoolErrorCodesFn;
  get_worker_pool_error_stats_last_24_hours: WorkerManagerGetWorkerPoolErrorStatsLast24HoursFn;
  get_worker_pool_error_stats_last_7_days: WorkerManagerGetWorkerPoolErrorStatsLast7DaysFn;
  get_worker_pool_error_titles: WorkerManagerGetWorkerPoolErrorTitlesFn;
  get_worker_pool_error_worker_pools: WorkerManagerGetWorkerPoolErrorWorkerPoolsFn;
  get_worker_pool_errors_for_worker_pool: WorkerManagerGetWorkerPoolErrorsForWorkerPoolFn;
  get_worker_pool_with_capacity_and_counts_by_state: WorkerManagerGetWorkerPoolWithCapacityAndCountsByStateFn;
  get_worker_pools_with_capacity_and_counts_by_state: WorkerManagerGetWorkerPoolsWithCapacityAndCountsByStateFn;
  remove_worker_pool_previous_provider_id: WorkerManagerRemoveWorkerPoolPreviousProviderIdFn;
  update_worker_2: WorkerManagerUpdateWorker2Fn;
  update_worker_pool_provider_data: WorkerManagerUpdateWorkerPoolProviderDataFn;
  update_worker_pool_with_capacity_and_counts_by_state: WorkerManagerUpdateWorkerPoolWithCapacityAndCountsByStateFn;
}

export interface DeprecatedDbFunctions {

  // Auth
  clients_entities_create: AuthClientsEntitiesCreateDeprecatedFn;
  clients_entities_load: AuthClientsEntitiesLoadDeprecatedFn;
  clients_entities_modify: AuthClientsEntitiesModifyDeprecatedFn;
  clients_entities_remove: AuthClientsEntitiesRemoveDeprecatedFn;
  clients_entities_scan: AuthClientsEntitiesScanDeprecatedFn;
  roles_entities_create: AuthRolesEntitiesCreateDeprecatedFn;
  roles_entities_load: AuthRolesEntitiesLoadDeprecatedFn;
  roles_entities_modify: AuthRolesEntitiesModifyDeprecatedFn;
  roles_entities_remove: AuthRolesEntitiesRemoveDeprecatedFn;
  roles_entities_scan: AuthRolesEntitiesScanDeprecatedFn;

  // Github
  create_github_build: GithubCreateGithubBuildDeprecatedFn;
  get_github_build: GithubGetGithubBuildDeprecatedFn;
  get_github_builds: GithubGetGithubBuildsDeprecatedFn;
  get_github_check_by_task_id: GithubGetGithubCheckByTaskIdDeprecatedFn;
  taskcluster_check_runs_entities_create: GithubTaskclusterCheckRunsEntitiesCreateDeprecatedFn;
  taskcluster_check_runs_entities_load: GithubTaskclusterCheckRunsEntitiesLoadDeprecatedFn;
  taskcluster_check_runs_entities_modify: GithubTaskclusterCheckRunsEntitiesModifyDeprecatedFn;
  taskcluster_check_runs_entities_remove: GithubTaskclusterCheckRunsEntitiesRemoveDeprecatedFn;
  taskcluster_check_runs_entities_scan: GithubTaskclusterCheckRunsEntitiesScanDeprecatedFn;
  taskcluster_checks_to_tasks_entities_create: GithubTaskclusterChecksToTasksEntitiesCreateDeprecatedFn;
  taskcluster_checks_to_tasks_entities_load: GithubTaskclusterChecksToTasksEntitiesLoadDeprecatedFn;
  taskcluster_checks_to_tasks_entities_modify: GithubTaskclusterChecksToTasksEntitiesModifyDeprecatedFn;
  taskcluster_checks_to_tasks_entities_remove: GithubTaskclusterChecksToTasksEntitiesRemoveDeprecatedFn;
  taskcluster_checks_to_tasks_entities_scan: GithubTaskclusterChecksToTasksEntitiesScanDeprecatedFn;
  taskcluster_github_builds_entities_create: GithubTaskclusterGithubBuildsEntitiesCreateDeprecatedFn;
  taskcluster_github_builds_entities_load: GithubTaskclusterGithubBuildsEntitiesLoadDeprecatedFn;
  taskcluster_github_builds_entities_modify: GithubTaskclusterGithubBuildsEntitiesModifyDeprecatedFn;
  taskcluster_github_builds_entities_remove: GithubTaskclusterGithubBuildsEntitiesRemoveDeprecatedFn;
  taskcluster_github_builds_entities_scan: GithubTaskclusterGithubBuildsEntitiesScanDeprecatedFn;
  taskcluster_integration_owners_entities_create: GithubTaskclusterIntegrationOwnersEntitiesCreateDeprecatedFn;
  taskcluster_integration_owners_entities_load: GithubTaskclusterIntegrationOwnersEntitiesLoadDeprecatedFn;
  taskcluster_integration_owners_entities_modify: GithubTaskclusterIntegrationOwnersEntitiesModifyDeprecatedFn;
  taskcluster_integration_owners_entities_remove: GithubTaskclusterIntegrationOwnersEntitiesRemoveDeprecatedFn;
  taskcluster_integration_owners_entities_scan: GithubTaskclusterIntegrationOwnersEntitiesScanDeprecatedFn;

  // Hooks
  get_last_fires: HooksGetLastFiresDeprecatedFn;
  hooks_entities_create: HooksHooksEntitiesCreateDeprecatedFn;
  hooks_entities_load: HooksHooksEntitiesLoadDeprecatedFn;
  hooks_entities_modify: HooksHooksEntitiesModifyDeprecatedFn;
  hooks_entities_remove: HooksHooksEntitiesRemoveDeprecatedFn;
  hooks_entities_scan: HooksHooksEntitiesScanDeprecatedFn;
  last_fire_3_entities_create: HooksLastFire3EntitiesCreateDeprecatedFn;
  last_fire_3_entities_load: HooksLastFire3EntitiesLoadDeprecatedFn;
  last_fire_3_entities_modify: HooksLastFire3EntitiesModifyDeprecatedFn;
  last_fire_3_entities_remove: HooksLastFire3EntitiesRemoveDeprecatedFn;
  last_fire_3_entities_scan: HooksLastFire3EntitiesScanDeprecatedFn;
  queues_entities_create: HooksQueuesEntitiesCreateDeprecatedFn;
  queues_entities_load: HooksQueuesEntitiesLoadDeprecatedFn;
  queues_entities_modify: HooksQueuesEntitiesModifyDeprecatedFn;
  queues_entities_remove: HooksQueuesEntitiesRemoveDeprecatedFn;
  queues_entities_scan: HooksQueuesEntitiesScanDeprecatedFn;

  // Index
  get_tasks_from_indexes: IndexGetTasksFromIndexesDeprecatedFn;
  indexed_tasks_entities_create: IndexIndexedTasksEntitiesCreateDeprecatedFn;
  indexed_tasks_entities_load: IndexIndexedTasksEntitiesLoadDeprecatedFn;
  indexed_tasks_entities_modify: IndexIndexedTasksEntitiesModifyDeprecatedFn;
  indexed_tasks_entities_remove: IndexIndexedTasksEntitiesRemoveDeprecatedFn;
  indexed_tasks_entities_scan: IndexIndexedTasksEntitiesScanDeprecatedFn;
  namespaces_entities_create: IndexNamespacesEntitiesCreateDeprecatedFn;
  namespaces_entities_load: IndexNamespacesEntitiesLoadDeprecatedFn;
  namespaces_entities_modify: IndexNamespacesEntitiesModifyDeprecatedFn;
  namespaces_entities_remove: IndexNamespacesEntitiesRemoveDeprecatedFn;
  namespaces_entities_scan: IndexNamespacesEntitiesScanDeprecatedFn;

  // Notify
  denylisted_notification_entities_create: NotifyDenylistedNotificationEntitiesCreateDeprecatedFn;
  denylisted_notification_entities_load: NotifyDenylistedNotificationEntitiesLoadDeprecatedFn;
  denylisted_notification_entities_modify: NotifyDenylistedNotificationEntitiesModifyDeprecatedFn;
  denylisted_notification_entities_remove: NotifyDenylistedNotificationEntitiesRemoveDeprecatedFn;
  denylisted_notification_entities_scan: NotifyDenylistedNotificationEntitiesScanDeprecatedFn;
  update_widgets: NotifyUpdateWidgetsDeprecatedFn;

  // Object
  create_object: ObjectCreateObjectDeprecatedFn;
  get_object: ObjectGetObjectDeprecatedFn;

  // PurgeCache
  all_purge_requests: PurgeCacheAllPurgeRequestsDeprecatedFn;
  cache_purges_entities_create: PurgeCacheCachePurgesEntitiesCreateDeprecatedFn;
  cache_purges_entities_load: PurgeCacheCachePurgesEntitiesLoadDeprecatedFn;
  cache_purges_entities_modify: PurgeCacheCachePurgesEntitiesModifyDeprecatedFn;
  cache_purges_entities_remove: PurgeCacheCachePurgesEntitiesRemoveDeprecatedFn;
  cache_purges_entities_scan: PurgeCacheCachePurgesEntitiesScanDeprecatedFn;
  purge_cache: PurgeCachePurgeCacheDeprecatedFn;
  purge_requests: PurgeCachePurgeRequestsDeprecatedFn;

  // Queue
  azure_queue_count: QueueAzureQueueCountDeprecatedFn;
  azure_queue_delete: QueueAzureQueueDeleteDeprecatedFn;
  azure_queue_delete_expired: QueueAzureQueueDeleteExpiredDeprecatedFn;
  azure_queue_get: QueueAzureQueueGetDeprecatedFn;
  azure_queue_put: QueueAzureQueuePutDeprecatedFn;
  azure_queue_put_extra: QueueAzureQueuePutExtraDeprecatedFn;
  azure_queue_update: QueueAzureQueueUpdateDeprecatedFn;
  create_queue_provisioner: QueueCreateQueueProvisionerDeprecatedFn;
  create_queue_worker: QueueCreateQueueWorkerDeprecatedFn;
  create_queue_worker_tqid: QueueCreateQueueWorkerTqidDeprecatedFn;
  create_queue_worker_type: QueueCreateQueueWorkerTypeDeprecatedFn;
  create_task: QueueCreateTaskDeprecatedFn;
  create_task_queue: QueueCreateTaskQueueDeprecatedFn;
  create_task_tqid: QueueCreateTaskTqidDeprecatedFn;
  expire_queue_provisioners: QueueExpireQueueProvisionersDeprecatedFn;
  expire_queue_worker_types: QueueExpireQueueWorkerTypesDeprecatedFn;
  get_queue_artifacts: QueueGetQueueArtifactsDeprecatedFn;
  get_queue_provisioner: QueueGetQueueProvisionerDeprecatedFn;
  get_queue_provisioners: QueueGetQueueProvisionersDeprecatedFn;
  get_queue_worker: QueueGetQueueWorkerDeprecatedFn;
  get_queue_worker_tqid: QueueGetQueueWorkerTqidDeprecatedFn;
  get_queue_worker_tqid_with_last_date_active: QueueGetQueueWorkerTqidWithLastDateActiveDeprecatedFn;
  get_queue_worker_type: QueueGetQueueWorkerTypeDeprecatedFn;
  get_queue_worker_types: QueueGetQueueWorkerTypesDeprecatedFn;
  get_queue_workers: QueueGetQueueWorkersDeprecatedFn;
  get_queue_workers_tqid: QueueGetQueueWorkersTqidDeprecatedFn;
  get_queue_workers_tqid_with_last_date_active: QueueGetQueueWorkersTqidWithLastDateActiveDeprecatedFn;
  get_task: QueueGetTaskDeprecatedFn;
  get_task_group: QueueGetTaskGroupDeprecatedFn;
  get_task_tqid: QueueGetTaskTqidDeprecatedFn;
  get_tasks_by_task_group: QueueGetTasksByTaskGroupDeprecatedFn;
  get_tasks_by_task_group_tqid: QueueGetTasksByTaskGroupTqidDeprecatedFn;
  quarantine_queue_worker: QueueQuarantineQueueWorkerDeprecatedFn;
  quarantine_queue_worker_with_last_date_active: QueueQuarantineQueueWorkerWithLastDateActiveDeprecatedFn;
  queue_artifacts_entities_create: QueueQueueArtifactsEntitiesCreateDeprecatedFn;
  queue_artifacts_entities_load: QueueQueueArtifactsEntitiesLoadDeprecatedFn;
  queue_artifacts_entities_modify: QueueQueueArtifactsEntitiesModifyDeprecatedFn;
  queue_artifacts_entities_remove: QueueQueueArtifactsEntitiesRemoveDeprecatedFn;
  queue_artifacts_entities_scan: QueueQueueArtifactsEntitiesScanDeprecatedFn;
  queue_pending_tasks_put: QueueQueuePendingTasksPutDeprecatedFn;
  queue_provisioner_entities_create: QueueQueueProvisionerEntitiesCreateDeprecatedFn;
  queue_provisioner_entities_load: QueueQueueProvisionerEntitiesLoadDeprecatedFn;
  queue_provisioner_entities_modify: QueueQueueProvisionerEntitiesModifyDeprecatedFn;
  queue_provisioner_entities_remove: QueueQueueProvisionerEntitiesRemoveDeprecatedFn;
  queue_provisioner_entities_scan: QueueQueueProvisionerEntitiesScanDeprecatedFn;
  queue_task_deadline_resolved: QueueQueueTaskDeadlineResolvedDeprecatedFn;
  queue_task_dependency_entities_create: QueueQueueTaskDependencyEntitiesCreateDeprecatedFn;
  queue_task_dependency_entities_load: QueueQueueTaskDependencyEntitiesLoadDeprecatedFn;
  queue_task_dependency_entities_modify: QueueQueueTaskDependencyEntitiesModifyDeprecatedFn;
  queue_task_dependency_entities_remove: QueueQueueTaskDependencyEntitiesRemoveDeprecatedFn;
  queue_task_dependency_entities_scan: QueueQueueTaskDependencyEntitiesScanDeprecatedFn;
  queue_task_group_active_sets_entities_create: QueueQueueTaskGroupActiveSetsEntitiesCreateDeprecatedFn;
  queue_task_group_active_sets_entities_load: QueueQueueTaskGroupActiveSetsEntitiesLoadDeprecatedFn;
  queue_task_group_active_sets_entities_modify: QueueQueueTaskGroupActiveSetsEntitiesModifyDeprecatedFn;
  queue_task_group_active_sets_entities_remove: QueueQueueTaskGroupActiveSetsEntitiesRemoveDeprecatedFn;
  queue_task_group_active_sets_entities_scan: QueueQueueTaskGroupActiveSetsEntitiesScanDeprecatedFn;
  queue_task_group_members_entities_create: QueueQueueTaskGroupMembersEntitiesCreateDeprecatedFn;
  queue_task_group_members_entities_load: QueueQueueTaskGroupMembersEntitiesLoadDeprecatedFn;
  queue_task_group_members_entities_modify: QueueQueueTaskGroupMembersEntitiesModifyDeprecatedFn;
  queue_task_group_members_entities_remove: QueueQueueTaskGroupMembersEntitiesRemoveDeprecatedFn;
  queue_task_group_members_entities_scan: QueueQueueTaskGroupMembersEntitiesScanDeprecatedFn;
  queue_task_groups_entities_create: QueueQueueTaskGroupsEntitiesCreateDeprecatedFn;
  queue_task_groups_entities_load: QueueQueueTaskGroupsEntitiesLoadDeprecatedFn;
  queue_task_groups_entities_modify: QueueQueueTaskGroupsEntitiesModifyDeprecatedFn;
  queue_task_groups_entities_remove: QueueQueueTaskGroupsEntitiesRemoveDeprecatedFn;
  queue_task_groups_entities_scan: QueueQueueTaskGroupsEntitiesScanDeprecatedFn;
  queue_task_requirement_entities_create: QueueQueueTaskRequirementEntitiesCreateDeprecatedFn;
  queue_task_requirement_entities_load: QueueQueueTaskRequirementEntitiesLoadDeprecatedFn;
  queue_task_requirement_entities_modify: QueueQueueTaskRequirementEntitiesModifyDeprecatedFn;
  queue_task_requirement_entities_remove: QueueQueueTaskRequirementEntitiesRemoveDeprecatedFn;
  queue_task_requirement_entities_scan: QueueQueueTaskRequirementEntitiesScanDeprecatedFn;
  queue_tasks_entities_create: QueueQueueTasksEntitiesCreateDeprecatedFn;
  queue_tasks_entities_load: QueueQueueTasksEntitiesLoadDeprecatedFn;
  queue_tasks_entities_modify: QueueQueueTasksEntitiesModifyDeprecatedFn;
  queue_tasks_entities_remove: QueueQueueTasksEntitiesRemoveDeprecatedFn;
  queue_tasks_entities_scan: QueueQueueTasksEntitiesScanDeprecatedFn;
  queue_worker_entities_create: QueueQueueWorkerEntitiesCreateDeprecatedFn;
  queue_worker_entities_load: QueueQueueWorkerEntitiesLoadDeprecatedFn;
  queue_worker_entities_modify: QueueQueueWorkerEntitiesModifyDeprecatedFn;
  queue_worker_entities_remove: QueueQueueWorkerEntitiesRemoveDeprecatedFn;
  queue_worker_entities_scan: QueueQueueWorkerEntitiesScanDeprecatedFn;
  queue_worker_seen: QueueQueueWorkerSeenDeprecatedFn;
  queue_worker_type_entities_create: QueueQueueWorkerTypeEntitiesCreateDeprecatedFn;
  queue_worker_type_entities_load: QueueQueueWorkerTypeEntitiesLoadDeprecatedFn;
  queue_worker_type_entities_modify: QueueQueueWorkerTypeEntitiesModifyDeprecatedFn;
  queue_worker_type_entities_remove: QueueQueueWorkerTypeEntitiesRemoveDeprecatedFn;
  queue_worker_type_entities_scan: QueueQueueWorkerTypeEntitiesScanDeprecatedFn;
  update_queue_artifact: QueueUpdateQueueArtifactDeprecatedFn;
  update_queue_provisioner: QueueUpdateQueueProvisionerDeprecatedFn;
  update_queue_worker: QueueUpdateQueueWorkerDeprecatedFn;
  update_queue_worker_tqid: QueueUpdateQueueWorkerTqidDeprecatedFn;
  update_queue_worker_type: QueueUpdateQueueWorkerTypeDeprecatedFn;
  update_task_queue: QueueUpdateTaskQueueDeprecatedFn;

  // Secrets
  secrets_entities_create: SecretsSecretsEntitiesCreateDeprecatedFn;
  secrets_entities_load: SecretsSecretsEntitiesLoadDeprecatedFn;
  secrets_entities_modify: SecretsSecretsEntitiesModifyDeprecatedFn;
  secrets_entities_remove: SecretsSecretsEntitiesRemoveDeprecatedFn;
  secrets_entities_scan: SecretsSecretsEntitiesScanDeprecatedFn;

  // WebServer
  access_token_table_entities_create: WebServerAccessTokenTableEntitiesCreateDeprecatedFn;
  access_token_table_entities_load: WebServerAccessTokenTableEntitiesLoadDeprecatedFn;
  access_token_table_entities_modify: WebServerAccessTokenTableEntitiesModifyDeprecatedFn;
  access_token_table_entities_remove: WebServerAccessTokenTableEntitiesRemoveDeprecatedFn;
  access_token_table_entities_scan: WebServerAccessTokenTableEntitiesScanDeprecatedFn;
  authorization_codes_table_entities_create: WebServerAuthorizationCodesTableEntitiesCreateDeprecatedFn;
  authorization_codes_table_entities_load: WebServerAuthorizationCodesTableEntitiesLoadDeprecatedFn;
  authorization_codes_table_entities_modify: WebServerAuthorizationCodesTableEntitiesModifyDeprecatedFn;
  authorization_codes_table_entities_remove: WebServerAuthorizationCodesTableEntitiesRemoveDeprecatedFn;
  authorization_codes_table_entities_scan: WebServerAuthorizationCodesTableEntitiesScanDeprecatedFn;
  github_access_token_table_entities_create: WebServerGithubAccessTokenTableEntitiesCreateDeprecatedFn;
  github_access_token_table_entities_load: WebServerGithubAccessTokenTableEntitiesLoadDeprecatedFn;
  github_access_token_table_entities_modify: WebServerGithubAccessTokenTableEntitiesModifyDeprecatedFn;
  github_access_token_table_entities_remove: WebServerGithubAccessTokenTableEntitiesRemoveDeprecatedFn;
  github_access_token_table_entities_scan: WebServerGithubAccessTokenTableEntitiesScanDeprecatedFn;
  session_storage_table_entities_create: WebServerSessionStorageTableEntitiesCreateDeprecatedFn;
  session_storage_table_entities_load: WebServerSessionStorageTableEntitiesLoadDeprecatedFn;
  session_storage_table_entities_modify: WebServerSessionStorageTableEntitiesModifyDeprecatedFn;
  session_storage_table_entities_remove: WebServerSessionStorageTableEntitiesRemoveDeprecatedFn;
  session_storage_table_entities_scan: WebServerSessionStorageTableEntitiesScanDeprecatedFn;

  // WorkerManager
  get_non_stopped_workers: WorkerManagerGetNonStoppedWorkersDeprecatedFn;
  get_non_stopped_workers_2: WorkerManagerGetNonStoppedWorkers2DeprecatedFn;
  get_non_stopped_workers_quntil: WorkerManagerGetNonStoppedWorkersQuntilDeprecatedFn;
  get_non_stopped_workers_quntil_providers: WorkerManagerGetNonStoppedWorkersQuntilProvidersDeprecatedFn;
  get_queue_worker_with_wm_join: WorkerManagerGetQueueWorkerWithWmJoinDeprecatedFn;
  get_queue_workers_with_wm_join_quarantined: WorkerManagerGetQueueWorkersWithWmJoinQuarantinedDeprecatedFn;
  get_task_queue_wm: WorkerManagerGetTaskQueueWmDeprecatedFn;
  get_worker: WorkerManagerGetWorkerDeprecatedFn;
  get_worker_pool: WorkerManagerGetWorkerPoolDeprecatedFn;
  get_worker_pool_errors: WorkerManagerGetWorkerPoolErrorsDeprecatedFn;
  get_worker_pool_with_capacity: WorkerManagerGetWorkerPoolWithCapacityDeprecatedFn;
  get_worker_pools: WorkerManagerGetWorkerPoolsDeprecatedFn;
  get_worker_pools_with_capacity: WorkerManagerGetWorkerPoolsWithCapacityDeprecatedFn;
  get_workers: WorkerManagerGetWorkersDeprecatedFn;
  get_workers_without_provider_data: WorkerManagerGetWorkersWithoutProviderDataDeprecatedFn;
  update_worker: WorkerManagerUpdateWorkerDeprecatedFn;
  update_worker_pool: WorkerManagerUpdateWorkerPoolDeprecatedFn;
  update_worker_pool_with_capacity: WorkerManagerUpdateWorkerPoolWithCapacityDeprecatedFn;
  wmworker_pool_errors_entities_create: WorkerManagerWmworkerPoolErrorsEntitiesCreateDeprecatedFn;
  wmworker_pool_errors_entities_load: WorkerManagerWmworkerPoolErrorsEntitiesLoadDeprecatedFn;
  wmworker_pool_errors_entities_modify: WorkerManagerWmworkerPoolErrorsEntitiesModifyDeprecatedFn;
  wmworker_pool_errors_entities_remove: WorkerManagerWmworkerPoolErrorsEntitiesRemoveDeprecatedFn;
  wmworker_pool_errors_entities_scan: WorkerManagerWmworkerPoolErrorsEntitiesScanDeprecatedFn;
  wmworker_pools_entities_create: WorkerManagerWmworkerPoolsEntitiesCreateDeprecatedFn;
  wmworker_pools_entities_load: WorkerManagerWmworkerPoolsEntitiesLoadDeprecatedFn;
  wmworker_pools_entities_modify: WorkerManagerWmworkerPoolsEntitiesModifyDeprecatedFn;
  wmworker_pools_entities_remove: WorkerManagerWmworkerPoolsEntitiesRemoveDeprecatedFn;
  wmworker_pools_entities_scan: WorkerManagerWmworkerPoolsEntitiesScanDeprecatedFn;
  wmworkers_entities_create: WorkerManagerWmworkersEntitiesCreateDeprecatedFn;
  wmworkers_entities_load: WorkerManagerWmworkersEntitiesLoadDeprecatedFn;
  wmworkers_entities_modify: WorkerManagerWmworkersEntitiesModifyDeprecatedFn;
  wmworkers_entities_remove: WorkerManagerWmworkersEntitiesRemoveDeprecatedFn;
  wmworkers_entities_scan: WorkerManagerWmworkersEntitiesScanDeprecatedFn;
}
