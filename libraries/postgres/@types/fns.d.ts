// Generated type definitions for DB functions
// DO NOT EDIT MANUALLY

export type DbFunctionMode = "read" | "write";
export type JsonB = any; // PostgreSQL JSONB type
export type TaskRequires = string; // Enum type from DB
export type TaskPriority = string; // Enum type from DB

// auth function signatures

/** @deprecated */
type AuthClientsEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ clients_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ clients_entities_create: string }]>;
};
/** @deprecated */
type AuthClientsEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type AuthClientsEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type AuthClientsEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type AuthClientsEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type AuthCreateClientFn = {
 (
   client_id_in: string,
   description_in: string,
   encrypted_access_token_in: JsonB,
   expires_in: Date,
   disabled_in: boolean,
   scopes_in: JsonB,
   delete_on_expiration_in: boolean
 ): Promise<void>;
 (params: {
  client_id_in: string;
  description_in: string;
  encrypted_access_token_in: JsonB;
  expires_in: Date;
  disabled_in: boolean;
  scopes_in: JsonB;
  delete_on_expiration_in: boolean;
 }): Promise<void>;
};
type AuthDeleteClientFn = {
 (
   client_id_in: string
 ): Promise<void>;
 (params: {
  client_id_in: string;
 }): Promise<void>;
};
/** @deprecated */
type AuthExpireClientsDeprecatedFn = {
 (
 ): Promise<[{ expire_clients: number }]>;
 (params: {
 }): Promise<[{ expire_clients: number }]>;
};
type AuthExpireClientsReturnClientIdsFn = {
 (
 ): Promise<Array<{client_id: string}>>;
 (params: {
 }): Promise<Array<{client_id: string}>>;
};
/** @deprecated */
type AuthGetAuditHistoryDeprecatedFn = {
 (
   entity_id_in: string,
   entity_type_in: string,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{client_id: string, action_type: string, created: Date}>>;
 (params: {
  entity_id_in: string;
  entity_type_in: string;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{client_id: string, action_type: string, created: Date}>>;
};
type AuthGetClientFn = {
 (
   client_id_in: string
 ): Promise<Array<{client_id: string, description: string, encrypted_access_token: JsonB, expires: Date, disabled: boolean, scopes: JsonB, created: Date, last_modified: Date, last_date_used: Date, last_rotated: Date, delete_on_expiration: boolean}>>;
 (params: {
  client_id_in: string;
 }): Promise<Array<{client_id: string, description: string, encrypted_access_token: JsonB, expires: Date, disabled: boolean, scopes: JsonB, created: Date, last_modified: Date, last_date_used: Date, last_rotated: Date, delete_on_expiration: boolean}>>;
};
type AuthGetClientsFn = {
 (
   prefix_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{client_id: string, description: string, encrypted_access_token: JsonB, expires: Date, disabled: boolean, scopes: JsonB, created: Date, last_modified: Date, last_date_used: Date, last_rotated: Date, delete_on_expiration: boolean}>>;
 (params: {
  prefix_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{client_id: string, description: string, encrypted_access_token: JsonB, expires: Date, disabled: boolean, scopes: JsonB, created: Date, last_modified: Date, last_date_used: Date, last_rotated: Date, delete_on_expiration: boolean}>>;
};
type AuthGetCombinedAuditHistoryFn = {
 (
   client_id_in: string,
   entity_id_in: string,
   entity_type_in: string,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{entity_id: string, entity_type: string, client_id: string, action_type: string, created: Date}>>;
 (params: {
  client_id_in: string;
  entity_id_in: string;
  entity_type_in: string;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{entity_id: string, entity_type: string, client_id: string, action_type: string, created: Date}>>;
};
type AuthGetRolesFn = {
 (
 ): Promise<Array<{role_id: string, scopes: JsonB, created: Date, description: string, last_modified: Date, etag: string}>>;
 (params: {
 }): Promise<Array<{role_id: string, scopes: JsonB, created: Date, description: string, last_modified: Date, etag: string}>>;
};
type AuthInsertAuthAuditHistoryFn = {
 (
   entity_id_in: string,
   entity_type_in: string,
   client_id_in: string,
   action_type_in: string
 ): Promise<void>;
 (params: {
  entity_id_in: string;
  entity_type_in: string;
  client_id_in: string;
  action_type_in: string;
 }): Promise<void>;
};
type AuthModifyRolesFn = {
 (
   roles_in: JsonB,
   old_etag_in: string
 ): Promise<void>;
 (params: {
  roles_in: JsonB;
  old_etag_in: string;
 }): Promise<void>;
};
type AuthPurgeAuditHistoryFn = {
 (
   cutoff_date_in: Date
 ): Promise<void>;
 (params: {
  cutoff_date_in: Date;
 }): Promise<void>;
};
/** @deprecated */
type AuthRolesEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ roles_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ roles_entities_create: string }]>;
};
/** @deprecated */
type AuthRolesEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type AuthRolesEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type AuthRolesEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type AuthRolesEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type AuthUpdateClientFn = {
 (
   client_id_in: string,
   description_in: string,
   encrypted_access_token_in: JsonB | null,
   expires_in: Date,
   disabled_in: boolean,
   scopes_in: JsonB,
   delete_on_expiration_in: boolean
 ): Promise<Array<{client_id: string, description: string, encrypted_access_token: JsonB, expires: Date, disabled: boolean, scopes: JsonB, created: Date, last_modified: Date, last_date_used: Date, last_rotated: Date, delete_on_expiration: boolean}>>;
 (params: {
  client_id_in: string;
  description_in: string;
  encrypted_access_token_in?: JsonB | null;
  expires_in: Date;
  disabled_in: boolean;
  scopes_in: JsonB;
  delete_on_expiration_in: boolean;
 }): Promise<Array<{client_id: string, description: string, encrypted_access_token: JsonB, expires: Date, disabled: boolean, scopes: JsonB, created: Date, last_modified: Date, last_date_used: Date, last_rotated: Date, delete_on_expiration: boolean}>>;
};
type AuthUpdateClientLastUsedFn = {
 (
   client_id_in: string
 ): Promise<void>;
 (params: {
  client_id_in: string;
 }): Promise<void>;
};
// github function signatures

/** @deprecated */
type GithubCreateGithubBuildDeprecatedFn = {
 (
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
 ): Promise<void>;
 (params: {
  organization_in: string;
  repository_in: string;
  sha_in: string;
  task_group_id_in: string;
  state_in: string;
  created_in: Date;
  updated_in: Date;
  installation_id_in: number;
  event_type_in: string;
  event_id_in: string;
 }): Promise<void>;
};
type GithubCreateGithubBuildPrFn = {
 (
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
 ): Promise<void>;
 (params: {
  organization_in: string;
  repository_in: string;
  sha_in: string;
  task_group_id_in: string;
  state_in: string;
  created_in: Date;
  updated_in: Date;
  installation_id_in: number;
  event_type_in: string;
  event_id_in: string;
  pull_request_number_in: number;
 }): Promise<void>;
};
type GithubCreateGithubCheckFn = {
 (
   task_group_id_in: string,
   task_id_in: string,
   check_suite_id_in: string,
   check_run_id_in: string
 ): Promise<void>;
 (params: {
  task_group_id_in: string;
  task_id_in: string;
  check_suite_id_in: string;
  check_run_id_in: string;
 }): Promise<void>;
};
type GithubDeleteGithubBuildFn = {
 (
   task_group_id_in: string
 ): Promise<void>;
 (params: {
  task_group_id_in: string;
 }): Promise<void>;
};
/** @deprecated */
type GithubGetGithubBuildDeprecatedFn = {
 (
   task_group_id_in: string
 ): Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, etag: string}>>;
 (params: {
  task_group_id_in: string;
 }): Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, etag: string}>>;
};
type GithubGetGithubBuildPrFn = {
 (
   task_group_id_in: string
 ): Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, pull_request_number: number, etag: string}>>;
 (params: {
  task_group_id_in: string;
 }): Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, pull_request_number: number, etag: string}>>;
};
/** @deprecated */
type GithubGetGithubBuildsDeprecatedFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null,
   organization_in: string | null,
   repository_in: string | null,
   sha_in: string | null
 ): Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, etag: string}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
  organization_in?: string | null;
  repository_in?: string | null;
  sha_in?: string | null;
 }): Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, etag: string}>>;
};
type GithubGetGithubBuildsPrFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null,
   organization_in: string | null,
   repository_in: string | null,
   sha_in: string | null,
   pull_request_number_in: number | null
 ): Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, pull_request_number: number, etag: string}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
  organization_in?: string | null;
  repository_in?: string | null;
  sha_in?: string | null;
  pull_request_number_in?: number | null;
 }): Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, pull_request_number: number, etag: string}>>;
};
type GithubGetGithubCheckByRunIdFn = {
 (
   check_suite_id_in: string,
   check_run_id_in: string
 ): Promise<Array<{task_group_id: string, task_id: string, check_suite_id: string, check_run_id: string}>>;
 (params: {
  check_suite_id_in: string;
  check_run_id_in: string;
 }): Promise<Array<{task_group_id: string, task_id: string, check_suite_id: string, check_run_id: string}>>;
};
type GithubGetGithubCheckByTaskGroupAndTaskIdFn = {
 (
   task_group_id_in: string,
   task_id_in: string
 ): Promise<Array<{task_group_id: string, task_id: string, check_suite_id: string, check_run_id: string}>>;
 (params: {
  task_group_id_in: string;
  task_id_in: string;
 }): Promise<Array<{task_group_id: string, task_id: string, check_suite_id: string, check_run_id: string}>>;
};
/** @deprecated */
type GithubGetGithubCheckByTaskIdDeprecatedFn = {
 (
   task_id_in: string
 ): Promise<Array<{task_group_id: string, task_id: string, check_suite_id: string, check_run_id: string}>>;
 (params: {
  task_id_in: string;
 }): Promise<Array<{task_group_id: string, task_id: string, check_suite_id: string, check_run_id: string}>>;
};
type GithubGetGithubChecksByTaskGroupIdFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null,
   task_group_id_in: string
 ): Promise<Array<{task_group_id: string, task_id: string, check_suite_id: string, check_run_id: string}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
  task_group_id_in: string;
 }): Promise<Array<{task_group_id: string, task_id: string, check_suite_id: string, check_run_id: string}>>;
};
type GithubGetGithubIntegrationFn = {
 (
   owner_in: string
 ): Promise<Array<{owner: string, installation_id: number}>>;
 (params: {
  owner_in: string;
 }): Promise<Array<{owner: string, installation_id: number}>>;
};
type GithubGetGithubIntegrationsFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{owner: string, installation_id: number}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{owner: string, installation_id: number}>>;
};
type GithubGetPendingGithubBuildsFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null,
   organization_in: string,
   repository_in: string,
   sha_in: string | null,
   pull_request_number_in: number | null
 ): Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, pull_request_number: number, etag: string}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
  organization_in: string;
  repository_in: string;
  sha_in?: string | null;
  pull_request_number_in?: number | null;
 }): Promise<Array<{organization: string, repository: string, sha: string, task_group_id: string, state: string, created: Date, updated: Date, installation_id: number, event_type: string, event_id: string, pull_request_number: number, etag: string}>>;
};
type GithubSetGithubBuildStateFn = {
 (
   task_group_id_in: string,
   state_in: string
 ): Promise<void>;
 (params: {
  task_group_id_in: string;
  state_in: string;
 }): Promise<void>;
};
/** @deprecated */
type GithubTaskclusterCheckRunsEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ taskcluster_check_runs_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ taskcluster_check_runs_entities_create: string }]>;
};
/** @deprecated */
type GithubTaskclusterCheckRunsEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterCheckRunsEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterCheckRunsEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterCheckRunsEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterChecksToTasksEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ taskcluster_checks_to_tasks_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ taskcluster_checks_to_tasks_entities_create: string }]>;
};
/** @deprecated */
type GithubTaskclusterChecksToTasksEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterChecksToTasksEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterChecksToTasksEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterChecksToTasksEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterGithubBuildsEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ taskcluster_github_builds_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ taskcluster_github_builds_entities_create: string }]>;
};
/** @deprecated */
type GithubTaskclusterGithubBuildsEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterGithubBuildsEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterGithubBuildsEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterGithubBuildsEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterIntegrationOwnersEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ taskcluster_integration_owners_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ taskcluster_integration_owners_entities_create: string }]>;
};
/** @deprecated */
type GithubTaskclusterIntegrationOwnersEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterIntegrationOwnersEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterIntegrationOwnersEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type GithubTaskclusterIntegrationOwnersEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type GithubUpsertGithubIntegrationFn = {
 (
   owner_in: string,
   installation_id_in: number
 ): Promise<void>;
 (params: {
  owner_in: string;
  installation_id_in: number;
 }): Promise<void>;
};
// hooks function signatures

type HooksCreateHookFn = {
 (
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
 ): Promise<Array<{hook_group_id: string, hook_id: string, metadata: JsonB, task: JsonB, bindings: JsonB, schedule: JsonB, encrypted_trigger_token: JsonB, encrypted_next_task_id: JsonB, next_scheduled_date: Date, trigger_schema: JsonB}>>;
 (params: {
  hook_group_id_in: string;
  hook_id_in: string;
  metadata_in: JsonB;
  task_in: JsonB;
  bindings_in: JsonB;
  schedule_in: JsonB;
  encrypted_trigger_token_in: JsonB;
  encrypted_next_task_id_in: JsonB;
  next_scheduled_date_in: Date;
  trigger_schema_in: JsonB;
 }): Promise<Array<{hook_group_id: string, hook_id: string, metadata: JsonB, task: JsonB, bindings: JsonB, schedule: JsonB, encrypted_trigger_token: JsonB, encrypted_next_task_id: JsonB, next_scheduled_date: Date, trigger_schema: JsonB}>>;
};
type HooksCreateHooksQueueFn = {
 (
   hook_group_id_in: string,
   hook_id_in: string,
   queue_name_in: string,
   bindings_in: JsonB
 ): Promise<[{ create_hooks_queue: string }]>;
 (params: {
  hook_group_id_in: string;
  hook_id_in: string;
  queue_name_in: string;
  bindings_in: JsonB;
 }): Promise<[{ create_hooks_queue: string }]>;
};
type HooksCreateLastFireFn = {
 (
   hook_group_id_in: string,
   hook_id_in: string,
   fired_by_in: string,
   task_id_in: string,
   task_create_time_in: Date,
   result_in: string,
   error_in: string
 ): Promise<[{ create_last_fire: string }]>;
 (params: {
  hook_group_id_in: string;
  hook_id_in: string;
  fired_by_in: string;
  task_id_in: string;
  task_create_time_in: Date;
  result_in: string;
  error_in: string;
 }): Promise<[{ create_last_fire: string }]>;
};
type HooksDeleteHookFn = {
 (
   hook_group_id_in: string,
   hook_id_in: string
 ): Promise<void>;
 (params: {
  hook_group_id_in: string;
  hook_id_in: string;
 }): Promise<void>;
};
type HooksDeleteHooksQueueFn = {
 (
   hook_group_id_in: string,
   hook_id_in: string
 ): Promise<void>;
 (params: {
  hook_group_id_in: string;
  hook_id_in: string;
 }): Promise<void>;
};
type HooksDeleteLastFiresFn = {
 (
   hook_group_id_in: string,
   hook_id_in: string
 ): Promise<void>;
 (params: {
  hook_group_id_in: string;
  hook_id_in: string;
 }): Promise<void>;
};
type HooksExpireLastFiresFn = {
 (
 ): Promise<[{ expire_last_fires: number }]>;
 (params: {
 }): Promise<[{ expire_last_fires: number }]>;
};
type HooksGetHookFn = {
 (
   hook_group_id_in: string,
   hook_id_in: string
 ): Promise<Array<{hook_group_id: string, hook_id: string, metadata: JsonB, task: JsonB, bindings: JsonB, schedule: JsonB, encrypted_trigger_token: JsonB, encrypted_next_task_id: JsonB, next_scheduled_date: Date, trigger_schema: JsonB}>>;
 (params: {
  hook_group_id_in: string;
  hook_id_in: string;
 }): Promise<Array<{hook_group_id: string, hook_id: string, metadata: JsonB, task: JsonB, bindings: JsonB, schedule: JsonB, encrypted_trigger_token: JsonB, encrypted_next_task_id: JsonB, next_scheduled_date: Date, trigger_schema: JsonB}>>;
};
type HooksGetHookGroupsFn = {
 (
 ): Promise<Array<{hook_group_id: string}>>;
 (params: {
 }): Promise<Array<{hook_group_id: string}>>;
};
type HooksGetHooksFn = {
 (
   hook_group_id_in: string | null,
   next_scheduled_date_in: Date | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{hook_group_id: string, hook_id: string, metadata: JsonB, task: JsonB, bindings: JsonB, schedule: JsonB, encrypted_trigger_token: JsonB, encrypted_next_task_id: JsonB, next_scheduled_date: Date, trigger_schema: JsonB}>>;
 (params: {
  hook_group_id_in?: string | null;
  next_scheduled_date_in?: Date | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{hook_group_id: string, hook_id: string, metadata: JsonB, task: JsonB, bindings: JsonB, schedule: JsonB, encrypted_trigger_token: JsonB, encrypted_next_task_id: JsonB, next_scheduled_date: Date, trigger_schema: JsonB}>>;
};
type HooksGetHooksQueuesFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{hook_group_id: string, hook_id: string, queue_name: string, bindings: JsonB, etag: string}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{hook_group_id: string, hook_id: string, queue_name: string, bindings: JsonB, etag: string}>>;
};
type HooksGetLastFireFn = {
 (
   hook_group_id_in: string,
   hook_id_in: string,
   task_id_in: string
 ): Promise<Array<{hook_group_id: string, hook_id: string, fired_by: string, task_id: string, task_create_time: Date, result: string, error: string, etag: string}>>;
 (params: {
  hook_group_id_in: string;
  hook_id_in: string;
  task_id_in: string;
 }): Promise<Array<{hook_group_id: string, hook_id: string, fired_by: string, task_id: string, task_create_time: Date, result: string, error: string, etag: string}>>;
};
/** @deprecated */
type HooksGetLastFiresDeprecatedFn = {
 (
   hook_group_id_in: string,
   hook_id_in: string,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{hook_group_id: string, hook_id: string, fired_by: string, task_id: string, task_create_time: Date, result: string, error: string, etag: string}>>;
 (params: {
  hook_group_id_in: string;
  hook_id_in: string;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{hook_group_id: string, hook_id: string, fired_by: string, task_id: string, task_create_time: Date, result: string, error: string, etag: string}>>;
};
type HooksGetLastFiresWithTaskStateFn = {
 (
   hook_group_id_in: string,
   hook_id_in: string,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{hook_group_id: string, hook_id: string, fired_by: string, task_id: string, task_create_time: Date, result: string, error: string, etag: string, task_state: string}>>;
 (params: {
  hook_group_id_in: string;
  hook_id_in: string;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{hook_group_id: string, hook_id: string, fired_by: string, task_id: string, task_create_time: Date, result: string, error: string, etag: string, task_state: string}>>;
};
/** @deprecated */
type HooksHooksEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ hooks_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ hooks_entities_create: string }]>;
};
/** @deprecated */
type HooksHooksEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type HooksHooksEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type HooksHooksEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type HooksHooksEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type HooksInsertHooksAuditHistoryFn = {
 (
   hook_id_in: string,
   client_id_in: string,
   action_type_in: string
 ): Promise<void>;
 (params: {
  hook_id_in: string;
  client_id_in: string;
  action_type_in: string;
 }): Promise<void>;
};
/** @deprecated */
type HooksLastFire3EntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ last_fire_3_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ last_fire_3_entities_create: string }]>;
};
/** @deprecated */
type HooksLastFire3EntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type HooksLastFire3EntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type HooksLastFire3EntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type HooksLastFire3EntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type HooksQueuesEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ queues_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ queues_entities_create: string }]>;
};
/** @deprecated */
type HooksQueuesEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type HooksQueuesEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type HooksQueuesEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type HooksQueuesEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type HooksUpdateHookFn = {
 (
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
 ): Promise<Array<{hook_group_id: string, hook_id: string, metadata: JsonB, task: JsonB, bindings: JsonB, schedule: JsonB, encrypted_trigger_token: JsonB, encrypted_next_task_id: JsonB, next_scheduled_date: Date, trigger_schema: JsonB}>>;
 (params: {
  hook_group_id_in: string;
  hook_id_in: string;
  metadata_in: JsonB;
  task_in: JsonB;
  bindings_in: JsonB;
  schedule_in: JsonB;
  encrypted_trigger_token_in: JsonB;
  encrypted_next_task_id_in: JsonB;
  next_scheduled_date_in: Date;
  trigger_schema_in: JsonB;
 }): Promise<Array<{hook_group_id: string, hook_id: string, metadata: JsonB, task: JsonB, bindings: JsonB, schedule: JsonB, encrypted_trigger_token: JsonB, encrypted_next_task_id: JsonB, next_scheduled_date: Date, trigger_schema: JsonB}>>;
};
type HooksUpdateHooksQueueBindingsFn = {
 (
   hook_group_id_in: string,
   hook_id_in: string,
   bindings_in: JsonB
 ): Promise<Array<{hook_group_id: string, hook_id: string, queue_name: string, bindings: JsonB, etag: string}>>;
 (params: {
  hook_group_id_in: string;
  hook_id_in: string;
  bindings_in: JsonB;
 }): Promise<Array<{hook_group_id: string, hook_id: string, queue_name: string, bindings: JsonB, etag: string}>>;
};
// index function signatures

type IndexCreateIndexNamespaceFn = {
 (
   parent_in: string,
   name_in: string,
   expires_in: Date
 ): Promise<Array<{parent: string, name: string, expires: Date}>>;
 (params: {
  parent_in: string;
  name_in: string;
  expires_in: Date;
 }): Promise<Array<{parent: string, name: string, expires: Date}>>;
};
type IndexCreateIndexedTaskFn = {
 (
   namespace_in: string,
   name_in: string,
   rank_in: number,
   task_id_in: string,
   data_in: JsonB,
   expires_in: Date
 ): Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;
 (params: {
  namespace_in: string;
  name_in: string;
  rank_in: number;
  task_id_in: string;
  data_in: JsonB;
  expires_in: Date;
 }): Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;
};
type IndexDeleteIndexedTaskFn = {
 (
   namespace_in: string,
   name_in: string
 ): Promise<void>;
 (params: {
  namespace_in: string;
  name_in: string;
 }): Promise<void>;
};
type IndexExpireIndexNamespacesFn = {
 (
 ): Promise<[{ expire_index_namespaces: number }]>;
 (params: {
 }): Promise<[{ expire_index_namespaces: number }]>;
};
type IndexExpireIndexedTasksFn = {
 (
 ): Promise<[{ expire_indexed_tasks: number }]>;
 (params: {
 }): Promise<[{ expire_indexed_tasks: number }]>;
};
type IndexGetIndexNamespaceFn = {
 (
   parent_in: string,
   name_in: string
 ): Promise<Array<{parent: string, name: string, expires: Date}>>;
 (params: {
  parent_in: string;
  name_in: string;
 }): Promise<Array<{parent: string, name: string, expires: Date}>>;
};
type IndexGetIndexNamespacesFn = {
 (
   parent_in: string | null,
   name_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{parent: string, name: string, expires: Date}>>;
 (params: {
  parent_in?: string | null;
  name_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{parent: string, name: string, expires: Date}>>;
};
type IndexGetIndexedTaskFn = {
 (
   namespace_in: string,
   name_in: string
 ): Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;
 (params: {
  namespace_in: string;
  name_in: string;
 }): Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;
};
type IndexGetIndexedTasksFn = {
 (
   namespace_in: string | null,
   name_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;
 (params: {
  namespace_in?: string | null;
  name_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;
};
/** @deprecated */
type IndexGetTasksFromIndexesDeprecatedFn = {
 (
   indexes_in: JsonB,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;
 (params: {
  indexes_in: JsonB;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;
};
type IndexGetTasksFromIndexesAndNamespacesFn = {
 (
   indexes_in: JsonB,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;
 (params: {
  indexes_in: JsonB;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;
};
/** @deprecated */
type IndexIndexedTasksEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ indexed_tasks_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ indexed_tasks_entities_create: string }]>;
};
/** @deprecated */
type IndexIndexedTasksEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type IndexIndexedTasksEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type IndexIndexedTasksEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type IndexIndexedTasksEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type IndexNamespacesEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ namespaces_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ namespaces_entities_create: string }]>;
};
/** @deprecated */
type IndexNamespacesEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type IndexNamespacesEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type IndexNamespacesEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type IndexNamespacesEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type IndexUpdateIndexNamespaceFn = {
 (
   parent_in: string,
   name_in: string,
   expires_in: Date
 ): Promise<Array<{parent: string, name: string, expires: Date}>>;
 (params: {
  parent_in: string;
  name_in: string;
  expires_in: Date;
 }): Promise<Array<{parent: string, name: string, expires: Date}>>;
};
type IndexUpdateIndexedTaskFn = {
 (
   namespace_in: string,
   name_in: string,
   rank_in: number,
   task_id_in: string,
   data_in: JsonB,
   expires_in: Date
 ): Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;
 (params: {
  namespace_in: string;
  name_in: string;
  rank_in: number;
  task_id_in: string;
  data_in: JsonB;
  expires_in: Date;
 }): Promise<Array<{namespace: string, name: string, rank: number, task_id: string, data: JsonB, expires: Date}>>;
};
// notify function signatures

type NotifyAddDenylistAddressFn = {
 (
   notification_type_in: string,
   notification_address_in: string
 ): Promise<void>;
 (params: {
  notification_type_in: string;
  notification_address_in: string;
 }): Promise<void>;
};
type NotifyAllDenylistAddressesFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{notification_type: string, notification_address: string}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{notification_type: string, notification_address: string}>>;
};
type NotifyDeleteDenylistAddressFn = {
 (
   notification_type_in: string,
   notification_address_in: string
 ): Promise<[{ delete_denylist_address: number }]>;
 (params: {
  notification_type_in: string;
  notification_address_in: string;
 }): Promise<[{ delete_denylist_address: number }]>;
};
/** @deprecated */
type NotifyDenylistedNotificationEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ denylisted_notification_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ denylisted_notification_entities_create: string }]>;
};
/** @deprecated */
type NotifyDenylistedNotificationEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type NotifyDenylistedNotificationEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type NotifyDenylistedNotificationEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type NotifyDenylistedNotificationEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type NotifyExistsDenylistAddressFn = {
 (
   notification_type_in: string,
   notification_address_in: string
 ): Promise<[{ exists_denylist_address: boolean }]>;
 (params: {
  notification_type_in: string;
  notification_address_in: string;
 }): Promise<[{ exists_denylist_address: boolean }]>;
};
/** @deprecated */
type NotifyUpdateWidgetsDeprecatedFn = {
 (
   name_in: string
 ): Promise<Array<{name: string}>>;
 (params: {
  name_in: string;
 }): Promise<Array<{name: string}>>;
};
// object function signatures

type ObjectAddObjectHashesFn = {
 (
   name_in: string,
   hashes_in: JsonB
 ): Promise<void>;
 (params: {
  name_in: string;
  hashes_in: JsonB;
 }): Promise<void>;
};
/** @deprecated */
type ObjectCreateObjectDeprecatedFn = {
 (
   name_in: string,
   project_id_in: string,
   backend_id_in: string,
   data_in: JsonB,
   expires_in: Date
 ): Promise<void>;
 (params: {
  name_in: string;
  project_id_in: string;
  backend_id_in: string;
  data_in: JsonB;
  expires_in: Date;
 }): Promise<void>;
};
type ObjectCreateObjectForUploadFn = {
 (
   name_in: string,
   project_id_in: string,
   backend_id_in: string,
   upload_id_in: string | null,
   upload_expires_in: Date | null,
   data_in: JsonB,
   expires_in: Date | null
 ): Promise<void>;
 (params: {
  name_in: string;
  project_id_in: string;
  backend_id_in: string;
  upload_id_in?: string | null;
  upload_expires_in?: Date | null;
  data_in: JsonB;
  expires_in?: Date | null;
 }): Promise<void>;
};
type ObjectDeleteObjectFn = {
 (
   name_in: string
 ): Promise<void>;
 (params: {
  name_in: string;
 }): Promise<void>;
};
type ObjectGetExpiredObjectsFn = {
 (
   limit_in: number,
   start_at_in: string | null
 ): Promise<Array<{name: string, data: JsonB, project_id: string, backend_id: string, expires: Date}>>;
 (params: {
  limit_in: number;
  start_at_in?: string | null;
 }): Promise<Array<{name: string, data: JsonB, project_id: string, backend_id: string, expires: Date}>>;
};
/** @deprecated */
type ObjectGetObjectDeprecatedFn = {
 (
   name_in: string
 ): Promise<Array<{name: string, data: JsonB, project_id: string, backend_id: string, expires: Date}>>;
 (params: {
  name_in: string;
 }): Promise<Array<{name: string, data: JsonB, project_id: string, backend_id: string, expires: Date}>>;
};
type ObjectGetObjectHashesFn = {
 (
   name_in: string
 ): Promise<Array<{algorithm: string, hash: string}>>;
 (params: {
  name_in: string;
 }): Promise<Array<{algorithm: string, hash: string}>>;
};
type ObjectGetObjectWithUploadFn = {
 (
   name_in: string
 ): Promise<Array<{name: string, data: JsonB, project_id: string, backend_id: string, upload_id: string, upload_expires: Date, expires: Date}>>;
 (params: {
  name_in: string;
 }): Promise<Array<{name: string, data: JsonB, project_id: string, backend_id: string, upload_id: string, upload_expires: Date, expires: Date}>>;
};
type ObjectObjectUploadCompleteFn = {
 (
   name_in: string,
   upload_id_in: string
 ): Promise<void>;
 (params: {
  name_in: string;
  upload_id_in: string;
 }): Promise<void>;
};
// purge_cache function signatures

/** @deprecated */
type PurgeCacheAllPurgeRequestsDeprecatedFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{provisioner_id: string, worker_type: string, cache_name: string, before: Date}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{provisioner_id: string, worker_type: string, cache_name: string, before: Date}>>;
};
type PurgeCacheAllPurgeRequestsWpidFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, cache_name: string, before: Date}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, cache_name: string, before: Date}>>;
};
/** @deprecated */
type PurgeCacheCachePurgesEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ cache_purges_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ cache_purges_entities_create: string }]>;
};
/** @deprecated */
type PurgeCacheCachePurgesEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type PurgeCacheCachePurgesEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type PurgeCacheCachePurgesEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type PurgeCacheCachePurgesEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type PurgeCacheExpireCachePurgesFn = {
 (
   expires_in: Date
 ): Promise<[{ expire_cache_purges: number }]>;
 (params: {
  expires_in: Date;
 }): Promise<[{ expire_cache_purges: number }]>;
};
/** @deprecated */
type PurgeCachePurgeCacheDeprecatedFn = {
 (
   provisioner_id_in: string,
   worker_type_in: string,
   cache_name_in: string,
   before_in: Date,
   expires_in: Date
 ): Promise<void>;
 (params: {
  provisioner_id_in: string;
  worker_type_in: string;
  cache_name_in: string;
  before_in: Date;
  expires_in: Date;
 }): Promise<void>;
};
type PurgeCachePurgeCacheWpidFn = {
 (
   worker_pool_id_in: string,
   cache_name_in: string,
   before_in: Date,
   expires_in: Date
 ): Promise<void>;
 (params: {
  worker_pool_id_in: string;
  cache_name_in: string;
  before_in: Date;
  expires_in: Date;
 }): Promise<void>;
};
/** @deprecated */
type PurgeCachePurgeRequestsDeprecatedFn = {
 (
   provisioner_id_in: string,
   worker_type_in: string
 ): Promise<Array<{provisioner_id: string, worker_type: string, cache_name: string, before: Date}>>;
 (params: {
  provisioner_id_in: string;
  worker_type_in: string;
 }): Promise<Array<{provisioner_id: string, worker_type: string, cache_name: string, before: Date}>>;
};
type PurgeCachePurgeRequestsWpidFn = {
 (
   worker_pool_id_in: string
 ): Promise<Array<{worker_pool_id: string, cache_name: string, before: Date}>>;
 (params: {
  worker_pool_id_in: string;
 }): Promise<Array<{worker_pool_id: string, cache_name: string, before: Date}>>;
};
// queue function signatures

type QueueAddTaskDependenciesFn = {
 (
   dependent_task_id_in: string,
   required_task_ids_in: JsonB,
   requires_in: TaskRequires,
   expires_in: Date
 ): Promise<void>;
 (params: {
  dependent_task_id_in: string;
  required_task_ids_in: JsonB;
  requires_in: TaskRequires;
  expires_in: Date;
 }): Promise<void>;
};
type QueueAddTaskDependencyFn = {
 (
   dependent_task_id_in: string,
   required_task_id_in: string,
   requires_in: TaskRequires,
   expires_in: Date
 ): Promise<void>;
 (params: {
  dependent_task_id_in: string;
  required_task_id_in: string;
  requires_in: TaskRequires;
  expires_in: Date;
 }): Promise<void>;
};
/** @deprecated */
type QueueAzureQueueCountDeprecatedFn = {
 (
   queue_name: string
 ): Promise<[{ azure_queue_count: number }]>;
 (params: {
  queue_name: string;
 }): Promise<[{ azure_queue_count: number }]>;
};
/** @deprecated */
type QueueAzureQueueDeleteDeprecatedFn = {
 (
   queue_name: string,
   message_id: string,
   pop_receipt: string
 ): Promise<void>;
 (params: {
  queue_name: string;
  message_id: string;
  pop_receipt: string;
 }): Promise<void>;
};
/** @deprecated */
type QueueAzureQueueDeleteExpiredDeprecatedFn = {
 (
 ): Promise<void>;
 (params: {
 }): Promise<void>;
};
/** @deprecated */
type QueueAzureQueueGetDeprecatedFn = {
 (
   queue_name: string,
   visible: any,
   count: number
 ): Promise<Array<{message_id: string, message_text: string, pop_receipt: string}>>;
 (params: {
  queue_name: string;
  visible: any;
  count: number;
 }): Promise<Array<{message_id: string, message_text: string, pop_receipt: string}>>;
};
/** @deprecated */
type QueueAzureQueuePutDeprecatedFn = {
 (
   queue_name: string,
   message_text: string,
   visible: any,
   expires: any
 ): Promise<void>;
 (params: {
  queue_name: string;
  message_text: string;
  visible: any;
  expires: any;
 }): Promise<void>;
};
/** @deprecated */
type QueueAzureQueuePutExtraDeprecatedFn = {
 (
   queue_name: string,
   message_text: string,
   visible: any,
   expires: any,
   task_queue_id: string,
   priority: number
 ): Promise<void>;
 (params: {
  queue_name: string;
  message_text: string;
  visible: any;
  expires: any;
  task_queue_id: string;
  priority: number;
 }): Promise<void>;
};
/** @deprecated */
type QueueAzureQueueUpdateDeprecatedFn = {
 (
   queue_name: string,
   message_text: string,
   message_id: string,
   pop_receipt: string,
   visible: any
 ): Promise<void>;
 (params: {
  queue_name: string;
  message_text: string;
  message_id: string;
  pop_receipt: string;
  visible: any;
 }): Promise<void>;
};
type QueueCancelTaskFn = {
 (
   task_id: string,
   reason: string
 ): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_id: string;
  reason: string;
 }): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
};
type QueueCancelTaskGroupFn = {
 (
   task_group_id_in: string,
   reason: string
 ): Promise<Array<{task_id: string, task_queue_id: string, project_id: string, scheduler_id: string, task_group_id: string, deadline: Date, expires: Date, retries_left: number, routes: JsonB, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_group_id_in: string;
  reason: string;
 }): Promise<Array<{task_id: string, task_queue_id: string, project_id: string, scheduler_id: string, task_group_id: string, deadline: Date, expires: Date, retries_left: number, routes: JsonB, runs: JsonB, taken_until: Date}>>;
};
type QueueCheckTaskClaimFn = {
 (
   task_id: string,
   run_id: number,
   taken_until_in: Date
 ): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_id: string;
  run_id: number;
  taken_until_in: Date;
 }): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
};
type QueueClaimTaskFn = {
 (
   task_id: string,
   run_id: number,
   worker_group: string,
   worker_id: string,
   hint_id: string,
   taken_until_in: Date
 ): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_id: string;
  run_id: number;
  worker_group: string;
  worker_id: string;
  hint_id: string;
  taken_until_in: Date;
 }): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
};
type QueueCreateQueueArtifactFn = {
 (
   task_id_in: string,
   run_id_in: number,
   name_in: string,
   storage_type_in: string,
   content_type_in: string,
   details_in: JsonB,
   present_in: boolean,
   expires_in: Date
 ): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
 (params: {
  task_id_in: string;
  run_id_in: number;
  name_in: string;
  storage_type_in: string;
  content_type_in: string;
  details_in: JsonB;
  present_in: boolean;
  expires_in: Date;
 }): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
};
/** @deprecated */
type QueueCreateQueueProvisionerDeprecatedFn = {
 (
   provisioner_id_in: string,
   expires_in: Date,
   last_date_active_in: Date,
   description_in: string,
   stability_in: string,
   actions_in: JsonB
 ): Promise<[{ create_queue_provisioner: string }]>;
 (params: {
  provisioner_id_in: string;
  expires_in: Date;
  last_date_active_in: Date;
  description_in: string;
  stability_in: string;
  actions_in: JsonB;
 }): Promise<[{ create_queue_provisioner: string }]>;
};
/** @deprecated */
type QueueCreateQueueWorkerDeprecatedFn = {
 (
   provisioner_id_in: string,
   worker_type_in: string,
   worker_group_in: string,
   worker_id_in: string,
   quarantine_until_in: Date,
   expires_in: Date,
   first_claim_in: Date,
   recent_tasks_in: JsonB
 ): Promise<[{ create_queue_worker: string }]>;
 (params: {
  provisioner_id_in: string;
  worker_type_in: string;
  worker_group_in: string;
  worker_id_in: string;
  quarantine_until_in: Date;
  expires_in: Date;
  first_claim_in: Date;
  recent_tasks_in: JsonB;
 }): Promise<[{ create_queue_worker: string }]>;
};
/** @deprecated */
type QueueCreateQueueWorkerTqidDeprecatedFn = {
 (
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string,
   quarantine_until_in: Date,
   expires_in: Date,
   first_claim_in: Date,
   recent_tasks_in: JsonB
 ): Promise<[{ create_queue_worker_tqid: string }]>;
 (params: {
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  quarantine_until_in: Date;
  expires_in: Date;
  first_claim_in: Date;
  recent_tasks_in: JsonB;
 }): Promise<[{ create_queue_worker_tqid: string }]>;
};
/** @deprecated */
type QueueCreateQueueWorkerTypeDeprecatedFn = {
 (
   provisioner_id_in: string,
   worker_type_in: string,
   expires_in: Date,
   last_date_active_in: Date,
   description_in: string,
   stability_in: string
 ): Promise<[{ create_queue_worker_type: string }]>;
 (params: {
  provisioner_id_in: string;
  worker_type_in: string;
  expires_in: Date;
  last_date_active_in: Date;
  description_in: string;
  stability_in: string;
 }): Promise<[{ create_queue_worker_type: string }]>;
};
/** @deprecated */
type QueueCreateTaskDeprecatedFn = {
 (
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
 ): Promise<void>;
 (params: {
  task_id: string;
  provisioner_id: string;
  worker_type: string;
  scheduler_id: string;
  task_group_id: string;
  dependencies: JsonB;
  requires: TaskRequires;
  routes: JsonB;
  priority: TaskPriority;
  retries: number;
  created: Date;
  deadline: Date;
  expires: Date;
  scopes: JsonB;
  payload: JsonB;
  metadata: JsonB;
  tags: JsonB;
  extra: JsonB;
 }): Promise<void>;
};
type QueueCreateTaskProjidFn = {
 (
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
 ): Promise<void>;
 (params: {
  task_id: string;
  task_queue_id: string;
  scheduler_id: string;
  project_id: string;
  task_group_id: string;
  dependencies: JsonB;
  requires: TaskRequires;
  routes: JsonB;
  priority: TaskPriority;
  retries: number;
  created: Date;
  deadline: Date;
  expires: Date;
  scopes: JsonB;
  payload: JsonB;
  metadata: JsonB;
  tags: JsonB;
  extra: JsonB;
 }): Promise<void>;
};
/** @deprecated */
type QueueCreateTaskQueueDeprecatedFn = {
 (
   task_queue_id_in: string,
   expires_in: Date,
   last_date_active_in: Date,
   description_in: string,
   stability_in: string
 ): Promise<[{ create_task_queue: string }]>;
 (params: {
  task_queue_id_in: string;
  expires_in: Date;
  last_date_active_in: Date;
  description_in: string;
  stability_in: string;
 }): Promise<[{ create_task_queue: string }]>;
};
/** @deprecated */
type QueueCreateTaskTqidDeprecatedFn = {
 (
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
 ): Promise<void>;
 (params: {
  task_id: string;
  task_queue_id: string;
  scheduler_id: string;
  task_group_id: string;
  dependencies: JsonB;
  requires: TaskRequires;
  routes: JsonB;
  priority: TaskPriority;
  retries: number;
  created: Date;
  deadline: Date;
  expires: Date;
  scopes: JsonB;
  payload: JsonB;
  metadata: JsonB;
  tags: JsonB;
  extra: JsonB;
 }): Promise<void>;
};
type QueueDeleteQueueArtifactFn = {
 (
   task_id_in: string,
   run_id_in: number,
   name_in: string
 ): Promise<void>;
 (params: {
  task_id_in: string;
  run_id_in: number;
  name_in: string;
 }): Promise<void>;
};
type QueueDeleteQueueArtifactsFn = {
 (
   task_id_run_id_names: JsonB
 ): Promise<void>;
 (params: {
  task_id_run_id_names: JsonB;
 }): Promise<void>;
};
type QueueDeleteQueueProvisionerFn = {
 (
   provisioner_id: string,
   stability: string,
   description: string
 ): Promise<void>;
 (params: {
  provisioner_id: string;
  stability: string;
  description: string;
 }): Promise<void>;
};
type QueueDeleteQueueWorkerTypeFn = {
 (
   provisioner_id: string,
   worker_type: string,
   stability: string,
   description: string
 ): Promise<void>;
 (params: {
  provisioner_id: string;
  worker_type: string;
  stability: string;
  description: string;
 }): Promise<void>;
};
type QueueEnsureTaskGroupFn = {
 (
   task_group_id_in: string,
   scheduler_id_in: string,
   expires_in: Date
 ): Promise<void>;
 (params: {
  task_group_id_in: string;
  scheduler_id_in: string;
  expires_in: Date;
 }): Promise<void>;
};
/** @deprecated */
type QueueExpireQueueProvisionersDeprecatedFn = {
 (
   expires_in: Date
 ): Promise<[{ expire_queue_provisioners: number }]>;
 (params: {
  expires_in: Date;
 }): Promise<[{ expire_queue_provisioners: number }]>;
};
/** @deprecated */
type QueueExpireQueueWorkerTypesDeprecatedFn = {
 (
   expires_in: Date
 ): Promise<[{ expire_queue_worker_types: number }]>;
 (params: {
  expires_in: Date;
 }): Promise<[{ expire_queue_worker_types: number }]>;
};
type QueueExpireQueueWorkersFn = {
 (
   expires_in: Date
 ): Promise<[{ expire_queue_workers: number }]>;
 (params: {
  expires_in: Date;
 }): Promise<[{ expire_queue_workers: number }]>;
};
type QueueExpireTaskDependenciesFn = {
 (
   expires_in: Date
 ): Promise<[{ expire_task_dependencies: number }]>;
 (params: {
  expires_in: Date;
 }): Promise<[{ expire_task_dependencies: number }]>;
};
type QueueExpireTaskGroupsFn = {
 (
   expires_in: Date
 ): Promise<[{ expire_task_groups: number }]>;
 (params: {
  expires_in: Date;
 }): Promise<[{ expire_task_groups: number }]>;
};
type QueueExpireTaskQueuesFn = {
 (
   expires_in: Date
 ): Promise<[{ expire_task_queues: number }]>;
 (params: {
  expires_in: Date;
 }): Promise<[{ expire_task_queues: number }]>;
};
type QueueExpireTasksFn = {
 (
   expires_in: Date
 ): Promise<[{ expire_tasks: number }]>;
 (params: {
  expires_in: Date;
 }): Promise<[{ expire_tasks: number }]>;
};
type QueueGetClaimedTasksByTaskQueueIdFn = {
 (
   task_queue_id_in: string,
   page_size_in: number | null,
   after_claimed_in: Date | null,
   after_task_id_in: string | null
 ): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, project_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date, run_id: number, worker_group: string, worker_id: string, claimed: Date}>>;
 (params: {
  task_queue_id_in: string;
  page_size_in?: number | null;
  after_claimed_in?: Date | null;
  after_task_id_in?: string | null;
 }): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, project_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date, run_id: number, worker_group: string, worker_id: string, claimed: Date}>>;
};
type QueueGetClaimedTasksByWorkerFn = {
 (
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string
 ): Promise<Array<{task_id: string, run_id: number}>>;
 (params: {
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
 }): Promise<Array<{task_id: string, run_id: number}>>;
};
type QueueGetDependentTasksFn = {
 (
   required_task_id_in: string,
   satisfied_in: boolean | null,
   tasks_after_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{dependent_task_id: string, requires: TaskRequires, satisfied: boolean}>>;
 (params: {
  required_task_id_in: string;
  satisfied_in?: boolean | null;
  tasks_after_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{dependent_task_id: string, requires: TaskRequires, satisfied: boolean}>>;
};
type QueueGetExpiredArtifactsForDeletionFn = {
 (
   expires_in: Date,
   page_size_in: number | null
 ): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
 (params: {
  expires_in: Date;
  page_size_in?: number | null;
 }): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
};
type QueueGetMultipleTasksFn = {
 (
   tasks_in: JsonB,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, project_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date}>>;
 (params: {
  tasks_in: JsonB;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, project_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date}>>;
};
type QueueGetPendingTasksByTaskQueueIdFn = {
 (
   task_queue_id_in: string,
   page_size_in: number | null,
   after_inserted_in: Date | null,
   after_task_id_in: string | null
 ): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, project_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date, run_id: number, inserted: Date}>>;
 (params: {
  task_queue_id_in: string;
  page_size_in?: number | null;
  after_inserted_in?: Date | null;
  after_task_id_in?: string | null;
 }): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, project_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date, run_id: number, inserted: Date}>>;
};
type QueueGetQueueArtifactFn = {
 (
   task_id_in: string,
   run_id_in: number,
   name_in: string
 ): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
 (params: {
  task_id_in: string;
  run_id_in: number;
  name_in: string;
 }): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
};
/** @deprecated */
type QueueGetQueueArtifactsDeprecatedFn = {
 (
   task_id_in: string | null,
   run_id_in: number | null,
   expires_in: Date | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
 (params: {
  task_id_in?: string | null;
  run_id_in?: number | null;
  expires_in?: Date | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
};
type QueueGetQueueArtifactsPaginatedFn = {
 (
   task_id_in: string | null,
   run_id_in: number | null,
   expires_in: Date | null,
   page_size_in: number | null,
   after_task_id_in: string | null,
   after_run_id_in: number,
   after_name_in: string
 ): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
 (params: {
  task_id_in?: string | null;
  run_id_in?: number | null;
  expires_in?: Date | null;
  page_size_in?: number | null;
  after_task_id_in?: string | null;
  after_run_id_in: number;
  after_name_in: string;
 }): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
};
/** @deprecated */
type QueueGetQueueProvisionerDeprecatedFn = {
 (
   provisioner_id_in: string,
   expires_in: Date
 ): Promise<Array<{provisioner_id: string, expires: Date, last_date_active: Date, description: string, stability: string, actions: JsonB, etag: string}>>;
 (params: {
  provisioner_id_in: string;
  expires_in: Date;
 }): Promise<Array<{provisioner_id: string, expires: Date, last_date_active: Date, description: string, stability: string, actions: JsonB, etag: string}>>;
};
/** @deprecated */
type QueueGetQueueProvisionersDeprecatedFn = {
 (
   expires_in: Date | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{provisioner_id: string, expires: Date, last_date_active: Date, description: string, stability: string, actions: JsonB, etag: string}>>;
 (params: {
  expires_in?: Date | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{provisioner_id: string, expires: Date, last_date_active: Date, description: string, stability: string, actions: JsonB, etag: string}>>;
};
/** @deprecated */
type QueueGetQueueWorkerDeprecatedFn = {
 (
   provisioner_id_in: string,
   worker_type_in: string,
   worker_group_in: string,
   worker_id_in: string,
   expires_in: Date
 ): Promise<Array<{provisioner_id: string, worker_type: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;
 (params: {
  provisioner_id_in: string;
  worker_type_in: string;
  worker_group_in: string;
  worker_id_in: string;
  expires_in: Date;
 }): Promise<Array<{provisioner_id: string, worker_type: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;
};
/** @deprecated */
type QueueGetQueueWorkerTqidDeprecatedFn = {
 (
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string,
   expires_in: Date
 ): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;
 (params: {
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  expires_in: Date;
 }): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;
};
/** @deprecated */
type QueueGetQueueWorkerTqidWithLastDateActiveDeprecatedFn = {
 (
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string,
   expires_in: Date
 ): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, etag: string}>>;
 (params: {
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  expires_in: Date;
 }): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, etag: string}>>;
};
/** @deprecated */
type QueueGetQueueWorkerTypeDeprecatedFn = {
 (
   provisioner_id_in: string,
   worker_type_in: string,
   expires_in: Date
 ): Promise<Array<{provisioner_id: string, worker_type: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
 (params: {
  provisioner_id_in: string;
  worker_type_in: string;
  expires_in: Date;
 }): Promise<Array<{provisioner_id: string, worker_type: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
};
/** @deprecated */
type QueueGetQueueWorkerTypesDeprecatedFn = {
 (
   provisioner_id_in: string | null,
   worker_type_in: string | null,
   expires_in: Date | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{provisioner_id: string, worker_type: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
 (params: {
  provisioner_id_in?: string | null;
  worker_type_in?: string | null;
  expires_in?: Date | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{provisioner_id: string, worker_type: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
};
/** @deprecated */
type QueueGetQueueWorkersDeprecatedFn = {
 (
   provisioner_id_in: string | null,
   worker_type_in: string | null,
   expires_in: Date | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{provisioner_id: string, worker_type: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;
 (params: {
  provisioner_id_in?: string | null;
  worker_type_in?: string | null;
  expires_in?: Date | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{provisioner_id: string, worker_type: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;
};
/** @deprecated */
type QueueGetQueueWorkersTqidDeprecatedFn = {
 (
   task_queue_id_in: string | null,
   expires_in: Date | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;
 (params: {
  task_queue_id_in?: string | null;
  expires_in?: Date | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;
};
/** @deprecated */
type QueueGetQueueWorkersTqidWithLastDateActiveDeprecatedFn = {
 (
   task_queue_id_in: string | null,
   expires_in: Date | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, etag: string}>>;
 (params: {
  task_queue_id_in?: string | null;
  expires_in?: Date | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, etag: string}>>;
};
/** @deprecated */
type QueueGetTaskDeprecatedFn = {
 (
   task_id_in: string
 ): Promise<Array<{task_id: string, provisioner_id: string, worker_type: string, scheduler_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_id_in: string;
 }): Promise<Array<{task_id: string, provisioner_id: string, worker_type: string, scheduler_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date}>>;
};
/** @deprecated */
type QueueGetTaskGroupDeprecatedFn = {
 (
   task_group_id_in: string
 ): Promise<Array<{task_group_id: string, scheduler_id: string, expires: Date}>>;
 (params: {
  task_group_id_in: string;
 }): Promise<Array<{task_group_id: string, scheduler_id: string, expires: Date}>>;
};
type QueueGetTaskGroupSizeFn = {
 (
   task_group_id_in: string
 ): Promise<[{ get_task_group_size: number }]>;
 (params: {
  task_group_id_in: string;
 }): Promise<[{ get_task_group_size: number }]>;
};
type QueueGetTaskGroup2Fn = {
 (
   task_group_id_in: string
 ): Promise<Array<{task_group_id: string, scheduler_id: string, expires: Date, sealed: Date}>>;
 (params: {
  task_group_id_in: string;
 }): Promise<Array<{task_group_id: string, scheduler_id: string, expires: Date, sealed: Date}>>;
};
type QueueGetTaskProjidFn = {
 (
   task_id_in: string
 ): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, project_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_id_in: string;
 }): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, project_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date}>>;
};
type QueueGetTaskQueueFn = {
 (
   task_queue_id_in: string,
   expires_in: Date
 ): Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
 (params: {
  task_queue_id_in: string;
  expires_in: Date;
 }): Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
};
type QueueGetTaskQueuesFn = {
 (
   task_queue_id_in: string | null,
   expires_in: Date | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
 (params: {
  task_queue_id_in?: string | null;
  expires_in?: Date | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
};
/** @deprecated */
type QueueGetTaskTqidDeprecatedFn = {
 (
   task_id_in: string
 ): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_id_in: string;
 }): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date}>>;
};
/** @deprecated */
type QueueGetTasksByTaskGroupDeprecatedFn = {
 (
   task_group_id_in: string,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{task_id: string, provisioner_id: string, worker_type: string, scheduler_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_group_id_in: string;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{task_id: string, provisioner_id: string, worker_type: string, scheduler_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date}>>;
};
type QueueGetTasksByTaskGroupProjidFn = {
 (
   task_group_id_in: string,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, project_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_group_id_in: string;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, project_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date}>>;
};
/** @deprecated */
type QueueGetTasksByTaskGroupTqidDeprecatedFn = {
 (
   task_group_id_in: string,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_group_id_in: string;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date}>>;
};
type QueueIsTaskBlockedFn = {
 (
   dependent_task_id_in: string
 ): Promise<[{ is_task_blocked: boolean }]>;
 (params: {
  dependent_task_id_in: string;
 }): Promise<[{ is_task_blocked: boolean }]>;
};
type QueueIsTaskGroupActiveFn = {
 (
   task_group_id_in: string
 ): Promise<[{ is_task_group_active: boolean }]>;
 (params: {
  task_group_id_in: string;
 }): Promise<[{ is_task_group_active: boolean }]>;
};
type QueueIsTaskGroupSealedFn = {
 (
   task_group_id_in: string
 ): Promise<[{ is_task_group_sealed: boolean }]>;
 (params: {
  task_group_id_in: string;
 }): Promise<[{ is_task_group_sealed: boolean }]>;
};
type QueueMarkTaskEverResolvedFn = {
 (
   task_id_in: string
 ): Promise<void>;
 (params: {
  task_id_in: string;
 }): Promise<void>;
};
/** @deprecated */
type QueueQuarantineQueueWorkerDeprecatedFn = {
 (
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string,
   quarantine_until_in: Date
 ): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB}>>;
 (params: {
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  quarantine_until_in: Date;
 }): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB}>>;
};
/** @deprecated */
type QueueQuarantineQueueWorkerWithLastDateActiveDeprecatedFn = {
 (
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string,
   quarantine_until_in: Date
 ): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date}>>;
 (params: {
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  quarantine_until_in: Date;
 }): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date}>>;
};
type QueueQuarantineQueueWorkerWithLastDateActiveAndDetailsFn = {
 (
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string,
   quarantine_until_in: Date,
   quarantine_details_in: JsonB
 ): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, quarantine_details: JsonB}>>;
 (params: {
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  quarantine_until_in: Date;
  quarantine_details_in: JsonB;
 }): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, quarantine_details: JsonB}>>;
};
type QueueQueueArtifactPresentFn = {
 (
   task_id_in: string,
   run_id_in: number,
   name_in: string
 ): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
 (params: {
  task_id_in: string;
  run_id_in: number;
  name_in: string;
 }): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
};
/** @deprecated */
type QueueQueueArtifactsEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ queue_artifacts_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ queue_artifacts_entities_create: string }]>;
};
/** @deprecated */
type QueueQueueArtifactsEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueArtifactsEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueArtifactsEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueArtifactsEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type QueueQueueChangeTaskGroupPriorityFn = {
 (
   task_group_id_in: string,
   new_priority_in: TaskPriority,
   batch_size_in: number
 ): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, project_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date, old_priority: TaskPriority}>>;
 (params: {
  task_group_id_in: string;
  new_priority_in: TaskPriority;
  batch_size_in: number;
 }): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, project_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date, old_priority: TaskPriority}>>;
};
type QueueQueueChangeTaskPriorityFn = {
 (
   task_id_in: string,
   new_priority_in: TaskPriority
 ): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, project_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date, old_priority: TaskPriority}>>;
 (params: {
  task_id_in: string;
  new_priority_in: TaskPriority;
 }): Promise<Array<{task_id: string, task_queue_id: string, scheduler_id: string, project_id: string, task_group_id: string, dependencies: JsonB, requires: TaskRequires, routes: JsonB, priority: TaskPriority, retries: number, retries_left: number, created: Date, deadline: Date, expires: Date, scopes: JsonB, payload: JsonB, metadata: JsonB, tags: JsonB, extra: JsonB, runs: JsonB, taken_until: Date, old_priority: TaskPriority}>>;
};
type QueueQueueClaimedTaskDeleteFn = {
 (
   task_id_in: string,
   pop_receipt_in: string
 ): Promise<void>;
 (params: {
  task_id_in: string;
  pop_receipt_in: string;
 }): Promise<void>;
};
type QueueQueueClaimedTaskGetFn = {
 (
   visible_in: Date,
   count: number
 ): Promise<Array<{task_id: string, run_id: number, taken_until: Date, pop_receipt: string}>>;
 (params: {
  visible_in: Date;
  count: number;
 }): Promise<Array<{task_id: string, run_id: number, taken_until: Date, pop_receipt: string}>>;
};
type QueueQueueClaimedTaskPutFn = {
 (
   task_id_in: string,
   run_id_in: number,
   taken_until_in: Date,
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string
 ): Promise<void>;
 (params: {
  task_id_in: string;
  run_id_in: number;
  taken_until_in: Date;
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
 }): Promise<void>;
};
type QueueQueueClaimedTaskResolvedFn = {
 (
   task_id_in: string,
   run_id_in: number
 ): Promise<void>;
 (params: {
  task_id_in: string;
  run_id_in: number;
 }): Promise<void>;
};
type QueueQueueClaimedTasksCountFn = {
 (
   task_queue_id_in: string
 ): Promise<[{ queue_claimed_tasks_count: number }]>;
 (params: {
  task_queue_id_in: string;
 }): Promise<[{ queue_claimed_tasks_count: number }]>;
};
type QueueQueuePendingTaskDeleteFn = {
 (
   task_id_in: string,
   run_id_in: number
 ): Promise<void>;
 (params: {
  task_id_in: string;
  run_id_in: number;
 }): Promise<void>;
};
type QueueQueuePendingTasksAddFn = {
 (
   task_queue_id_in: string,
   priority_in: number,
   task_id_in: string,
   run_id_in: number,
   hint_id_in: string,
   expires_in: any
 ): Promise<void>;
 (params: {
  task_queue_id_in: string;
  priority_in: number;
  task_id_in: string;
  run_id_in: number;
  hint_id_in: string;
  expires_in: any;
 }): Promise<void>;
};
type QueueQueuePendingTasksCountFn = {
 (
   task_queue_id_in: string
 ): Promise<[{ queue_pending_tasks_count: number }]>;
 (params: {
  task_queue_id_in: string;
 }): Promise<[{ queue_pending_tasks_count: number }]>;
};
type QueueQueuePendingTasksDeleteFn = {
 (
   task_id_in: string,
   pop_receipt_in: string
 ): Promise<void>;
 (params: {
  task_id_in: string;
  pop_receipt_in: string;
 }): Promise<void>;
};
type QueueQueuePendingTasksDeleteExpiredFn = {
 (
 ): Promise<void>;
 (params: {
 }): Promise<void>;
};
type QueueQueuePendingTasksGetFn = {
 (
   task_queue_id_in: string,
   visible_in: Date,
   count: number
 ): Promise<Array<{task_id: string, run_id: number, hint_id: string, pop_receipt: string}>>;
 (params: {
  task_queue_id_in: string;
  visible_in: Date;
  count: number;
 }): Promise<Array<{task_id: string, run_id: number, hint_id: string, pop_receipt: string}>>;
};
/** @deprecated */
type QueueQueuePendingTasksPutDeprecatedFn = {
 (
   task_queue_id_in: string,
   priority_in: number,
   task_id_in: string,
   run_id_in: number,
   hint_id_in: string,
   expires_in: any,
   queue_name_compat_in: string
 ): Promise<void>;
 (params: {
  task_queue_id_in: string;
  priority_in: number;
  task_id_in: string;
  run_id_in: number;
  hint_id_in: string;
  expires_in: any;
  queue_name_compat_in: string;
 }): Promise<void>;
};
type QueueQueuePendingTasksReleaseFn = {
 (
   task_id_in: string,
   pop_receipt_in: string
 ): Promise<void>;
 (params: {
  task_id_in: string;
  pop_receipt_in: string;
 }): Promise<void>;
};
/** @deprecated */
type QueueQueueProvisionerEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ queue_provisioner_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ queue_provisioner_entities_create: string }]>;
};
/** @deprecated */
type QueueQueueProvisionerEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueProvisionerEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueProvisionerEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueProvisionerEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type QueueQueueResolvedTaskDeleteFn = {
 (
   task_id_in: string,
   pop_receipt_in: string
 ): Promise<void>;
 (params: {
  task_id_in: string;
  pop_receipt_in: string;
 }): Promise<void>;
};
type QueueQueueResolvedTaskGetFn = {
 (
   visible_in: Date,
   count: number
 ): Promise<Array<{task_id: string, task_group_id: string, scheduler_id: string, resolution: string, pop_receipt: string}>>;
 (params: {
  visible_in: Date;
  count: number;
 }): Promise<Array<{task_id: string, task_group_id: string, scheduler_id: string, resolution: string, pop_receipt: string}>>;
};
type QueueQueueResolvedTaskPutFn = {
 (
   task_group_id_in: string,
   task_id_in: string,
   scheduler_id_in: string,
   resolution_in: string
 ): Promise<void>;
 (params: {
  task_group_id_in: string;
  task_id_in: string;
  scheduler_id_in: string;
  resolution_in: string;
 }): Promise<void>;
};
type QueueQueueTaskDeadlineDeleteFn = {
 (
   task_id_in: string,
   pop_receipt_in: string
 ): Promise<void>;
 (params: {
  task_id_in: string;
  pop_receipt_in: string;
 }): Promise<void>;
};
type QueueQueueTaskDeadlineGetFn = {
 (
   visible_in: Date,
   count: number
 ): Promise<Array<{task_id: string, task_group_id: string, scheduler_id: string, deadline: Date, pop_receipt: string}>>;
 (params: {
  visible_in: Date;
  count: number;
 }): Promise<Array<{task_id: string, task_group_id: string, scheduler_id: string, deadline: Date, pop_receipt: string}>>;
};
type QueueQueueTaskDeadlinePutFn = {
 (
   task_group_id_in: string,
   task_id_in: string,
   scheduler_id_in: string,
   deadline_in: Date,
   visible: Date
 ): Promise<void>;
 (params: {
  task_group_id_in: string;
  task_id_in: string;
  scheduler_id_in: string;
  deadline_in: Date;
  visible: Date;
 }): Promise<void>;
};
/** @deprecated */
type QueueQueueTaskDeadlineResolvedDeprecatedFn = {
 (
   task_id_in: string
 ): Promise<void>;
 (params: {
  task_id_in: string;
 }): Promise<void>;
};
/** @deprecated */
type QueueQueueTaskDependencyEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ queue_task_dependency_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ queue_task_dependency_entities_create: string }]>;
};
/** @deprecated */
type QueueQueueTaskDependencyEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskDependencyEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskDependencyEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskDependencyEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskGroupActiveSetsEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ queue_task_group_active_sets_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ queue_task_group_active_sets_entities_create: string }]>;
};
/** @deprecated */
type QueueQueueTaskGroupActiveSetsEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskGroupActiveSetsEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskGroupActiveSetsEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskGroupActiveSetsEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskGroupMembersEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ queue_task_group_members_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ queue_task_group_members_entities_create: string }]>;
};
/** @deprecated */
type QueueQueueTaskGroupMembersEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskGroupMembersEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskGroupMembersEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskGroupMembersEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskGroupsEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ queue_task_groups_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ queue_task_groups_entities_create: string }]>;
};
/** @deprecated */
type QueueQueueTaskGroupsEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskGroupsEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskGroupsEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskGroupsEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskRequirementEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ queue_task_requirement_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ queue_task_requirement_entities_create: string }]>;
};
/** @deprecated */
type QueueQueueTaskRequirementEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskRequirementEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskRequirementEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueTaskRequirementEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueTasksEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ queue_tasks_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ queue_tasks_entities_create: string }]>;
};
/** @deprecated */
type QueueQueueTasksEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueTasksEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueTasksEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueTasksEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueWorkerEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ queue_worker_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ queue_worker_entities_create: string }]>;
};
/** @deprecated */
type QueueQueueWorkerEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueWorkerEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueWorkerEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueWorkerEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueWorkerSeenDeprecatedFn = {
 (
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string,
   expires_in: Date
 ): Promise<void>;
 (params: {
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  expires_in: Date;
 }): Promise<void>;
};
type QueueQueueWorkerSeenWithLastDateActiveFn = {
 (
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string,
   expires_in: Date
 ): Promise<void>;
 (params: {
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  expires_in: Date;
 }): Promise<void>;
};
type QueueQueueWorkerStatsFn = {
 (
 ): Promise<Array<{task_queue_id: string, worker_count: number, quarantined_count: number, claimed_count: number, pending_count: number}>>;
 (params: {
 }): Promise<Array<{task_queue_id: string, worker_count: number, quarantined_count: number, claimed_count: number, pending_count: number}>>;
};
type QueueQueueWorkerTaskSeenFn = {
 (
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string,
   task_run_in: JsonB
 ): Promise<void>;
 (params: {
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  task_run_in: JsonB;
 }): Promise<void>;
};
/** @deprecated */
type QueueQueueWorkerTypeEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ queue_worker_type_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ queue_worker_type_entities_create: string }]>;
};
/** @deprecated */
type QueueQueueWorkerTypeEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type QueueQueueWorkerTypeEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueWorkerTypeEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type QueueQueueWorkerTypeEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type QueueReclaimTaskFn = {
 (
   task_id: string,
   run_id: number,
   taken_until_in: Date
 ): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_id: string;
  run_id: number;
  taken_until_in: Date;
 }): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
};
type QueueRemoveTaskFn = {
 (
   task_id: string
 ): Promise<void>;
 (params: {
  task_id: string;
 }): Promise<void>;
};
type QueueRemoveTaskDependenciesFn = {
 (
   dependent_task_id_in: string,
   required_task_ids_in: JsonB
 ): Promise<void>;
 (params: {
  dependent_task_id_in: string;
  required_task_ids_in: JsonB;
 }): Promise<void>;
};
type QueueRemoveTaskDependencyFn = {
 (
   dependent_task_id_in: string,
   required_task_id_in: string
 ): Promise<void>;
 (params: {
  dependent_task_id_in: string;
  required_task_id_in: string;
 }): Promise<void>;
};
type QueueRerunTaskFn = {
 (
   task_id: string
 ): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_id: string;
 }): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
};
type QueueResolveTaskFn = {
 (
   task_id: string,
   run_id: number,
   state: string,
   reason: string,
   retry_reason: string
 ): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_id: string;
  run_id: number;
  state: string;
  reason: string;
  retry_reason: string;
 }): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
};
type QueueResolveTaskAtDeadlineFn = {
 (
   task_id: string
 ): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_id: string;
 }): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
};
type QueueSatisfyTaskDependencyFn = {
 (
   dependent_task_id_in: string,
   required_task_id_in: string
 ): Promise<void>;
 (params: {
  dependent_task_id_in: string;
  required_task_id_in: string;
 }): Promise<void>;
};
type QueueScheduleTaskFn = {
 (
   task_id: string,
   reason_created: string
 ): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
 (params: {
  task_id: string;
  reason_created: string;
 }): Promise<Array<{retries_left: number, runs: JsonB, taken_until: Date}>>;
};
type QueueSealTaskGroupFn = {
 (
   task_group_id_in: string
 ): Promise<Array<{task_group_id: string, scheduler_id: string, expires: Date, sealed: Date}>>;
 (params: {
  task_group_id_in: string;
 }): Promise<Array<{task_group_id: string, scheduler_id: string, expires: Date, sealed: Date}>>;
};
type QueueTaskQueueSeenFn = {
 (
   task_queue_id_in: string,
   expires_in: Date,
   description_in: string,
   stability_in: string
 ): Promise<void>;
 (params: {
  task_queue_id_in: string;
  expires_in: Date;
  description_in: string;
  stability_in: string;
 }): Promise<void>;
};
/** @deprecated */
type QueueUpdateQueueArtifactDeprecatedFn = {
 (
   task_id_in: string,
   run_id_in: number,
   name_in: string,
   details_in: JsonB,
   expires_in: Date
 ): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
 (params: {
  task_id_in: string;
  run_id_in: number;
  name_in: string;
  details_in: JsonB;
  expires_in: Date;
 }): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
};
type QueueUpdateQueueArtifact2Fn = {
 (
   task_id_in: string,
   run_id_in: number,
   name_in: string,
   storage_type_in: string,
   details_in: JsonB,
   expires_in: Date
 ): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
 (params: {
  task_id_in: string;
  run_id_in: number;
  name_in: string;
  storage_type_in: string;
  details_in: JsonB;
  expires_in: Date;
 }): Promise<Array<{task_id: string, run_id: number, name: string, storage_type: string, content_type: string, details: JsonB, present: boolean, expires: Date}>>;
};
/** @deprecated */
type QueueUpdateQueueProvisionerDeprecatedFn = {
 (
   provisioner_id_in: string,
   expires_in: Date,
   last_date_active_in: Date,
   description_in: string,
   stability_in: string,
   actions_in: JsonB
 ): Promise<Array<{provisioner_id: string, expires: Date, last_date_active: Date, description: string, stability: string, actions: JsonB, etag: string}>>;
 (params: {
  provisioner_id_in: string;
  expires_in: Date;
  last_date_active_in: Date;
  description_in: string;
  stability_in: string;
  actions_in: JsonB;
 }): Promise<Array<{provisioner_id: string, expires: Date, last_date_active: Date, description: string, stability: string, actions: JsonB, etag: string}>>;
};
/** @deprecated */
type QueueUpdateQueueWorkerDeprecatedFn = {
 (
   provisioner_id_in: string,
   worker_type_in: string,
   worker_group_in: string,
   worker_id_in: string,
   quarantine_until_in: Date,
   expires_in: Date,
   recent_tasks_in: JsonB
 ): Promise<Array<{provisioner_id: string, worker_type: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;
 (params: {
  provisioner_id_in: string;
  worker_type_in: string;
  worker_group_in: string;
  worker_id_in: string;
  quarantine_until_in: Date;
  expires_in: Date;
  recent_tasks_in: JsonB;
 }): Promise<Array<{provisioner_id: string, worker_type: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;
};
/** @deprecated */
type QueueUpdateQueueWorkerTqidDeprecatedFn = {
 (
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string,
   quarantine_until_in: Date,
   expires_in: Date,
   recent_tasks_in: JsonB
 ): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;
 (params: {
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  quarantine_until_in: Date;
  expires_in: Date;
  recent_tasks_in: JsonB;
 }): Promise<Array<{task_queue_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, etag: string}>>;
};
/** @deprecated */
type QueueUpdateQueueWorkerTypeDeprecatedFn = {
 (
   provisioner_id_in: string,
   worker_type_in: string,
   expires_in: Date,
   last_date_active_in: Date,
   description_in: string,
   stability_in: string
 ): Promise<Array<{provisioner_id: string, worker_type: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
 (params: {
  provisioner_id_in: string;
  worker_type_in: string;
  expires_in: Date;
  last_date_active_in: Date;
  description_in: string;
  stability_in: string;
 }): Promise<Array<{provisioner_id: string, worker_type: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
};
/** @deprecated */
type QueueUpdateTaskQueueDeprecatedFn = {
 (
   task_queue_id_in: string,
   expires_in: Date,
   last_date_active_in: Date,
   description_in: string,
   stability_in: string
 ): Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
 (params: {
  task_queue_id_in: string;
  expires_in: Date;
  last_date_active_in: Date;
  description_in: string;
  stability_in: string;
 }): Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
};
// secrets function signatures

type SecretsDeleteSecretFn = {
 (
   name_in: string
 ): Promise<void>;
 (params: {
  name_in: string;
 }): Promise<void>;
};
/** @deprecated */
type SecretsExpireSecretsDeprecatedFn = {
 (
 ): Promise<[{ expire_secrets: number }]>;
 (params: {
 }): Promise<[{ expire_secrets: number }]>;
};
type SecretsExpireSecretsReturnNamesFn = {
 (
 ): Promise<Array<{name: string}>>;
 (params: {
 }): Promise<Array<{name: string}>>;
};
type SecretsGetSecretFn = {
 (
   name_in: string
 ): Promise<Array<{name: string, encrypted_secret: JsonB, expires: Date}>>;
 (params: {
  name_in: string;
 }): Promise<Array<{name: string, encrypted_secret: JsonB, expires: Date}>>;
};
type SecretsGetSecretsFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{name: string}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{name: string}>>;
};
type SecretsInsertSecretsAuditHistoryFn = {
 (
   secret_id_in: string,
   client_id_in: string,
   action_type_in: string
 ): Promise<void>;
 (params: {
  secret_id_in: string;
  client_id_in: string;
  action_type_in: string;
 }): Promise<void>;
};
/** @deprecated */
type SecretsSecretsEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ secrets_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ secrets_entities_create: string }]>;
};
/** @deprecated */
type SecretsSecretsEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type SecretsSecretsEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type SecretsSecretsEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type SecretsSecretsEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type SecretsUpsertSecretFn = {
 (
   name_in: string,
   encrypted_secret_in: JsonB,
   expires_in: Date
 ): Promise<void>;
 (params: {
  name_in: string;
  encrypted_secret_in: JsonB;
  expires_in: Date;
 }): Promise<void>;
};
// web_server function signatures

/** @deprecated */
type WebServerAccessTokenTableEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ access_token_table_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ access_token_table_entities_create: string }]>;
};
/** @deprecated */
type WebServerAccessTokenTableEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type WebServerAccessTokenTableEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type WebServerAccessTokenTableEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type WebServerAccessTokenTableEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type WebServerAddGithubAccessTokenFn = {
 (
   user_id_in: string,
   encrypted_access_token_in: JsonB
 ): Promise<void>;
 (params: {
  user_id_in: string;
  encrypted_access_token_in: JsonB;
 }): Promise<void>;
};
/** @deprecated */
type WebServerAuthorizationCodesTableEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ authorization_codes_table_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ authorization_codes_table_entities_create: string }]>;
};
/** @deprecated */
type WebServerAuthorizationCodesTableEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type WebServerAuthorizationCodesTableEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type WebServerAuthorizationCodesTableEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type WebServerAuthorizationCodesTableEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type WebServerCreateAccessTokenFn = {
 (
   hashed_access_token_in: string,
   encrypted_access_token_in: JsonB,
   client_id_in: string,
   redirect_uri_in: string,
   identity_in: string,
   identity_provider_id_in: string,
   expires_in: Date,
   client_details_in: JsonB
 ): Promise<Array<{hashed_access_token: string, encrypted_access_token: JsonB, client_id: string, redirect_uri: string, identity: string, identity_provider_id: string, expires: Date, client_details: JsonB}>>;
 (params: {
  hashed_access_token_in: string;
  encrypted_access_token_in: JsonB;
  client_id_in: string;
  redirect_uri_in: string;
  identity_in: string;
  identity_provider_id_in: string;
  expires_in: Date;
  client_details_in: JsonB;
 }): Promise<Array<{hashed_access_token: string, encrypted_access_token: JsonB, client_id: string, redirect_uri: string, identity: string, identity_provider_id: string, expires: Date, client_details: JsonB}>>;
};
type WebServerCreateAuthorizationCodeFn = {
 (
   code_in: string,
   client_id_in: string,
   redirect_uri_in: string,
   identity_in: string,
   identity_provider_id_in: string,
   expires_in: Date,
   client_details_in: JsonB
 ): Promise<Array<{code: string, client_id: string, redirect_uri: string, identity: string, identity_provider_id: string, expires: Date, client_details: JsonB}>>;
 (params: {
  code_in: string;
  client_id_in: string;
  redirect_uri_in: string;
  identity_in: string;
  identity_provider_id_in: string;
  expires_in: Date;
  client_details_in: JsonB;
 }): Promise<Array<{code: string, client_id: string, redirect_uri: string, identity: string, identity_provider_id: string, expires: Date, client_details: JsonB}>>;
};
type WebServerExpireAccessTokensFn = {
 (
   expires_in: Date
 ): Promise<[{ expire_access_tokens: number }]>;
 (params: {
  expires_in: Date;
 }): Promise<[{ expire_access_tokens: number }]>;
};
type WebServerExpireAuthorizationCodesFn = {
 (
   expires_in: Date
 ): Promise<[{ expire_authorization_codes: number }]>;
 (params: {
  expires_in: Date;
 }): Promise<[{ expire_authorization_codes: number }]>;
};
type WebServerExpireSessionsFn = {
 (
 ): Promise<[{ expire_sessions: number }]>;
 (params: {
 }): Promise<[{ expire_sessions: number }]>;
};
type WebServerGetAccessTokenFn = {
 (
   hashed_access_token_in: string
 ): Promise<Array<{hashed_access_token: string, encrypted_access_token: JsonB, client_id: string, redirect_uri: string, identity: string, identity_provider_id: string, expires: Date, client_details: JsonB}>>;
 (params: {
  hashed_access_token_in: string;
 }): Promise<Array<{hashed_access_token: string, encrypted_access_token: JsonB, client_id: string, redirect_uri: string, identity: string, identity_provider_id: string, expires: Date, client_details: JsonB}>>;
};
type WebServerGetAuthorizationCodeFn = {
 (
   code_in: string
 ): Promise<Array<{code: string, client_id: string, redirect_uri: string, identity: string, identity_provider_id: string, expires: Date, client_details: JsonB}>>;
 (params: {
  code_in: string;
 }): Promise<Array<{code: string, client_id: string, redirect_uri: string, identity: string, identity_provider_id: string, expires: Date, client_details: JsonB}>>;
};
/** @deprecated */
type WebServerGithubAccessTokenTableEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ github_access_token_table_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ github_access_token_table_entities_create: string }]>;
};
/** @deprecated */
type WebServerGithubAccessTokenTableEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type WebServerGithubAccessTokenTableEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type WebServerGithubAccessTokenTableEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type WebServerGithubAccessTokenTableEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type WebServerLoadGithubAccessTokenFn = {
 (
   user_id_in: string
 ): Promise<Array<{encrypted_access_token: JsonB}>>;
 (params: {
  user_id_in: string;
 }): Promise<Array<{encrypted_access_token: JsonB}>>;
};
type WebServerSessionAddFn = {
 (
   hashed_session_id_in: string,
   encrypted_session_id_in: JsonB,
   data_in: JsonB,
   expires_in: Date
 ): Promise<void>;
 (params: {
  hashed_session_id_in: string;
  encrypted_session_id_in: JsonB;
  data_in: JsonB;
  expires_in: Date;
 }): Promise<void>;
};
type WebServerSessionLoadFn = {
 (
   hashed_session_id_in: string
 ): Promise<Array<{hashed_session_id: string, encrypted_session_id: JsonB, data: JsonB, expires: Date}>>;
 (params: {
  hashed_session_id_in: string;
 }): Promise<Array<{hashed_session_id: string, encrypted_session_id: JsonB, data: JsonB, expires: Date}>>;
};
type WebServerSessionRemoveFn = {
 (
   hashed_session_id_in: string
 ): Promise<void>;
 (params: {
  hashed_session_id_in: string;
 }): Promise<void>;
};
/** @deprecated */
type WebServerSessionStorageTableEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ session_storage_table_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ session_storage_table_entities_create: string }]>;
};
/** @deprecated */
type WebServerSessionStorageTableEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type WebServerSessionStorageTableEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type WebServerSessionStorageTableEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type WebServerSessionStorageTableEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
type WebServerSessionTouchFn = {
 (
   hashed_session_id_in: string,
   data_in: JsonB,
   expires_in: Date
 ): Promise<void>;
 (params: {
  hashed_session_id_in: string;
  data_in: JsonB;
  expires_in: Date;
 }): Promise<void>;
};
// worker_manager function signatures

type WorkerManagerCollectLaunchConfigsIfExistFn = {
 (
   config_in: JsonB,
   worker_pool_id_in: string
 ): Promise<[{ collect_launch_configs_if_exist: JsonB }]>;
 (params: {
  config_in: JsonB;
  worker_pool_id_in: string;
 }): Promise<[{ collect_launch_configs_if_exist: JsonB }]>;
};
/** @deprecated */
type WorkerManagerCreateWorkerDeprecatedFn = {
 (
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
 ): Promise<[{ create_worker: string }]>;
 (params: {
  worker_pool_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  provider_id_in: string;
  created_in: Date;
  expires_in: Date;
  state_in: string;
  provider_data_in: JsonB;
  capacity_in: number;
  last_modified_in: Date;
  last_checked_in: Date;
 }): Promise<[{ create_worker: string }]>;
};
/** @deprecated */
type WorkerManagerCreateWorkerPoolDeprecatedFn = {
 (
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
 ): Promise<void>;
 (params: {
  worker_pool_id_in: string;
  provider_id_in: string;
  previous_provider_ids_in: JsonB;
  description_in: string;
  config_in: JsonB;
  created_in: Date;
  last_modified_in: Date;
  owner_in: string;
  email_on_error_in: boolean;
  provider_data_in: JsonB;
 }): Promise<void>;
};
/** @deprecated */
type WorkerManagerCreateWorkerPoolErrorDeprecatedFn = {
 (
   error_id_in: string,
   worker_pool_id_in: string,
   reported_in: Date,
   kind_in: string,
   title_in: string,
   description_in: string,
   extra_in: JsonB
 ): Promise<[{ create_worker_pool_error: string }]>;
 (params: {
  error_id_in: string;
  worker_pool_id_in: string;
  reported_in: Date;
  kind_in: string;
  title_in: string;
  description_in: string;
  extra_in: JsonB;
 }): Promise<[{ create_worker_pool_error: string }]>;
};
type WorkerManagerCreateWorkerPoolErrorLaunchConfigFn = {
 (
   error_id_in: string,
   worker_pool_id_in: string,
   reported_in: Date,
   kind_in: string,
   title_in: string,
   description_in: string,
   extra_in: JsonB,
   launch_config_id_in: string
 ): Promise<[{ create_worker_pool_error_launch_config: string }]>;
 (params: {
  error_id_in: string;
  worker_pool_id_in: string;
  reported_in: Date;
  kind_in: string;
  title_in: string;
  description_in: string;
  extra_in: JsonB;
  launch_config_id_in: string;
 }): Promise<[{ create_worker_pool_error_launch_config: string }]>;
};
type WorkerManagerCreateWorkerPoolLaunchConfigFn = {
 (
   launch_config_id_in: string,
   worker_pool_id_in: string,
   is_archived_in: boolean,
   configuration_in: JsonB,
   created_in: Date,
   last_modified_in: Date
 ): Promise<void>;
 (params: {
  launch_config_id_in: string;
  worker_pool_id_in: string;
  is_archived_in: boolean;
  configuration_in: JsonB;
  created_in: Date;
  last_modified_in: Date;
 }): Promise<void>;
};
type WorkerManagerCreateWorkerPoolWithLaunchConfigsFn = {
 (
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
 ): Promise<Array<{updated_launch_configs: any, created_launch_configs: any, archived_launch_configs: any}>>;
 (params: {
  worker_pool_id_in: string;
  provider_id_in: string;
  previous_provider_ids_in: JsonB;
  description_in: string;
  config_in: JsonB;
  created_in: Date;
  last_modified_in: Date;
  owner_in: string;
  email_on_error_in: boolean;
  provider_data_in: JsonB;
 }): Promise<Array<{updated_launch_configs: any, created_launch_configs: any, archived_launch_configs: any}>>;
};
type WorkerManagerCreateWorkerWithLcFn = {
 (
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
   launch_config_id_in: string
 ): Promise<[{ create_worker_with_lc: string }]>;
 (params: {
  worker_pool_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  provider_id_in: string;
  created_in: Date;
  expires_in: Date;
  state_in: string;
  provider_data_in: JsonB;
  capacity_in: number;
  last_modified_in: Date;
  last_checked_in: Date;
  launch_config_id_in: string;
 }): Promise<[{ create_worker_with_lc: string }]>;
};
type WorkerManagerDeleteWorkerFn = {
 (
   worker_pool_id_in: string,
   worker_group_in: string,
   worker_id_in: string
 ): Promise<void>;
 (params: {
  worker_pool_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
 }): Promise<void>;
};
type WorkerManagerDeleteWorkerPoolFn = {
 (
   worker_pool_id_in: string
 ): Promise<void>;
 (params: {
  worker_pool_id_in: string;
 }): Promise<void>;
};
type WorkerManagerDeleteWorkerPoolErrorFn = {
 (
   error_id_in: string,
   worker_pool_id_in: string
 ): Promise<void>;
 (params: {
  error_id_in: string;
  worker_pool_id_in: string;
 }): Promise<void>;
};
type WorkerManagerExpireWorkerPoolErrorsFn = {
 (
   expires_in: Date
 ): Promise<[{ expire_worker_pool_errors: number }]>;
 (params: {
  expires_in: Date;
 }): Promise<[{ expire_worker_pool_errors: number }]>;
};
type WorkerManagerExpireWorkerPoolLaunchConfigsFn = {
 (
 ): Promise<Array<{launch_config_id: string}>>;
 (params: {
 }): Promise<Array<{launch_config_id: string}>>;
};
type WorkerManagerExpireWorkerPoolsFn = {
 (
 ): Promise<Array<{worker_pool_id: string}>>;
 (params: {
 }): Promise<Array<{worker_pool_id: string}>>;
};
type WorkerManagerExpireWorkersFn = {
 (
   expires_in: Date
 ): Promise<[{ expire_workers: number }]>;
 (params: {
  expires_in: Date;
 }): Promise<[{ expire_workers: number }]>;
};
/** @deprecated */
type WorkerManagerGetNonStoppedWorkersDeprecatedFn = {
 (
   worker_pool_id_in: string | null,
   worker_group_in: string | null,
   worker_id_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date}>>;
 (params: {
  worker_pool_id_in?: string | null;
  worker_group_in?: string | null;
  worker_id_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date}>>;
};
/** @deprecated */
type WorkerManagerGetNonStoppedWorkers2DeprecatedFn = {
 (
   worker_pool_id_in: string | null,
   worker_group_in: string | null,
   worker_id_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string}>>;
 (params: {
  worker_pool_id_in?: string | null;
  worker_group_in?: string | null;
  worker_id_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string}>>;
};
/** @deprecated */
type WorkerManagerGetNonStoppedWorkersQuntilDeprecatedFn = {
 (
   worker_pool_id_in: string | null,
   worker_group_in: string | null,
   worker_id_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string, quarantine_until: Date}>>;
 (params: {
  worker_pool_id_in?: string | null;
  worker_group_in?: string | null;
  worker_id_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string, quarantine_until: Date}>>;
};
/** @deprecated */
type WorkerManagerGetNonStoppedWorkersQuntilProvidersDeprecatedFn = {
 (
   worker_pool_id_in: string | null,
   worker_group_in: string | null,
   worker_id_in: string | null,
   providers_filter_cond: string | null,
   providers_filter_value: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string, quarantine_until: Date}>>;
 (params: {
  worker_pool_id_in?: string | null;
  worker_group_in?: string | null;
  worker_id_in?: string | null;
  providers_filter_cond?: string | null;
  providers_filter_value?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string, quarantine_until: Date}>>;
};
/** @deprecated */
type WorkerManagerGetNonStoppedWorkersScannerDeprecatedFn = {
 (
   worker_pool_id_in: string | null,
   worker_group_in: string | null,
   worker_id_in: string | null,
   providers_filter_cond: string | null,
   providers_filter_value: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string, quarantine_until: Date, first_claim: Date, last_date_active: Date}>>;
 (params: {
  worker_pool_id_in?: string | null;
  worker_group_in?: string | null;
  worker_id_in?: string | null;
  providers_filter_cond?: string | null;
  providers_filter_value?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string, quarantine_until: Date, first_claim: Date, last_date_active: Date}>>;
};
type WorkerManagerGetNonStoppedWorkersWithLaunchConfigScannerFn = {
 (
   worker_pool_id_in: string | null,
   worker_group_in: string | null,
   worker_id_in: string | null,
   providers_filter_cond_in: string | null,
   providers_filter_value_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string, launch_config_id: string, quarantine_until: Date, first_claim: Date, last_date_active: Date}>>;
 (params: {
  worker_pool_id_in?: string | null;
  worker_group_in?: string | null;
  worker_id_in?: string | null;
  providers_filter_cond_in?: string | null;
  providers_filter_value_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string, launch_config_id: string, quarantine_until: Date, first_claim: Date, last_date_active: Date}>>;
};
type WorkerManagerGetQueueWorkerWithWmDataFn = {
 (
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string,
   expires_in: Date
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, quarantine_details: JsonB, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string, launch_config_id: string}>>;
 (params: {
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  expires_in: Date;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, quarantine_details: JsonB, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string, launch_config_id: string}>>;
};
/** @deprecated */
type WorkerManagerGetQueueWorkerWithWmJoinDeprecatedFn = {
 (
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string,
   expires_in: Date
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;
 (params: {
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  expires_in: Date;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;
};
/** @deprecated */
type WorkerManagerGetQueueWorkerWithWmJoin2DeprecatedFn = {
 (
   task_queue_id_in: string,
   worker_group_in: string,
   worker_id_in: string,
   expires_in: Date
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, quarantine_details: JsonB, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;
 (params: {
  task_queue_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  expires_in: Date;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, quarantine_details: JsonB, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;
};
type WorkerManagerGetQueueWorkersWithWmDataFn = {
 (
   task_queue_id_in: string | null,
   expires_in: Date | null,
   worker_state_in: string | null,
   only_quarantined_in: boolean,
   launch_config_id_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string, launch_config_id: string}>>;
 (params: {
  task_queue_id_in?: string | null;
  expires_in?: Date | null;
  worker_state_in?: string | null;
  only_quarantined_in: boolean;
  launch_config_id_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string, launch_config_id: string}>>;
};
/** @deprecated */
type WorkerManagerGetQueueWorkersWithWmJoinDeprecatedFn = {
 (
   task_queue_id_in: string | null,
   expires_in: Date | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;
 (params: {
  task_queue_id_in?: string | null;
  expires_in?: Date | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;
};
/** @deprecated */
type WorkerManagerGetQueueWorkersWithWmJoinQuarantinedDeprecatedFn = {
 (
   task_queue_id_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;
 (params: {
  task_queue_id_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;
};
/** @deprecated */
type WorkerManagerGetQueueWorkersWithWmJoinQuarantined2DeprecatedFn = {
 (
   task_queue_id_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;
 (params: {
  task_queue_id_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;
};
/** @deprecated */
type WorkerManagerGetQueueWorkersWithWmJoinStateDeprecatedFn = {
 (
   task_queue_id_in: string | null,
   expires_in: Date | null,
   page_size_in: number | null,
   page_offset_in: number | null,
   worker_state_in: string
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;
 (params: {
  task_queue_id_in?: string | null;
  expires_in?: Date | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
  worker_state_in: string;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, quarantine_until: Date, expires: Date, first_claim: Date, recent_tasks: JsonB, last_date_active: Date, state: string, capacity: any, provider_id: string, etag: string}>>;
};
/** @deprecated */
type WorkerManagerGetTaskQueueWmDeprecatedFn = {
 (
   task_queue_id_in: string | null,
   expires_in: Date | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
 (params: {
  task_queue_id_in?: string | null;
  expires_in?: Date | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
};
type WorkerManagerGetTaskQueueWm2Fn = {
 (
   task_queue_id_in: string,
   expires_in: Date
 ): Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
 (params: {
  task_queue_id_in: string;
  expires_in: Date;
 }): Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
};
type WorkerManagerGetTaskQueuesWmFn = {
 (
   task_queue_id_in: string | null,
   expires_in: Date | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
 (params: {
  task_queue_id_in?: string | null;
  expires_in?: Date | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{task_queue_id: string, expires: Date, last_date_active: Date, description: string, stability: string, etag: string}>>;
};
/** @deprecated */
type WorkerManagerGetWorkerDeprecatedFn = {
 (
   worker_pool_id_in: string,
   worker_group_in: string,
   worker_id_in: string
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, etag: string}>>;
 (params: {
  worker_pool_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, etag: string}>>;
};
/** @deprecated */
type WorkerManagerGetWorker2DeprecatedFn = {
 (
   worker_pool_id_in: string,
   worker_group_in: string,
   worker_id_in: string
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string}>>;
 (params: {
  worker_pool_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string}>>;
};
type WorkerManagerGetWorker3Fn = {
 (
   worker_pool_id_in: string,
   worker_group_in: string,
   worker_id_in: string
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string, launch_config_id: string}>>;
 (params: {
  worker_pool_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, secret: JsonB, etag: string, launch_config_id: string}>>;
};
/** @deprecated */
type WorkerManagerGetWorkerManagerWorkersDeprecatedFn = {
 (
   worker_pool_id_in: string | null,
   worker_group_in: string | null,
   worker_id_in: string | null,
   state_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, capacity: number, last_modified: Date, last_checked: Date}>>;
 (params: {
  worker_pool_id_in?: string | null;
  worker_group_in?: string | null;
  worker_id_in?: string | null;
  state_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, capacity: number, last_modified: Date, last_checked: Date}>>;
};
type WorkerManagerGetWorkerManagerWorkers2Fn = {
 (
   worker_pool_id_in: string | null,
   worker_group_in: string | null,
   worker_id_in: string | null,
   state_in: string | null,
   launch_config_id_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, capacity: number, last_modified: Date, last_checked: Date, launch_config_id: string}>>;
 (params: {
  worker_pool_id_in?: string | null;
  worker_group_in?: string | null;
  worker_id_in?: string | null;
  state_in?: string | null;
  launch_config_id_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, capacity: number, last_modified: Date, last_checked: Date, launch_config_id: string}>>;
};
/** @deprecated */
type WorkerManagerGetWorkerPoolDeprecatedFn = {
 (
   worker_pool_id_in: string
 ): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB}>>;
 (params: {
  worker_pool_id_in: string;
 }): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB}>>;
};
type WorkerManagerGetWorkerPoolCountsAndCapacityFn = {
 (
   worker_pool_id_in: string
 ): Promise<Array<{worker_pool_id: string, current_capacity: number, stopped_capacity: number, stopped_count: number, requested_capacity: number, requested_count: number, running_capacity: number, running_count: number, stopping_capacity: number, stopping_count: number}>>;
 (params: {
  worker_pool_id_in: string;
 }): Promise<Array<{worker_pool_id: string, current_capacity: number, stopped_capacity: number, stopped_count: number, requested_capacity: number, requested_count: number, running_capacity: number, running_count: number, stopping_capacity: number, stopping_count: number}>>;
};
type WorkerManagerGetWorkerPoolCountsAndCapacityLcFn = {
 (
   worker_pool_id_in: string,
   launch_config_id_in: string | null
 ): Promise<Array<{worker_pool_id: string, launch_config_id: string, current_capacity: number, stopped_capacity: number, stopped_count: number, requested_capacity: number, requested_count: number, running_capacity: number, running_count: number, stopping_capacity: number, stopping_count: number}>>;
 (params: {
  worker_pool_id_in: string;
  launch_config_id_in?: string | null;
 }): Promise<Array<{worker_pool_id: string, launch_config_id: string, current_capacity: number, stopped_capacity: number, stopped_count: number, requested_capacity: number, requested_count: number, running_capacity: number, running_count: number, stopping_capacity: number, stopping_count: number}>>;
};
/** @deprecated */
type WorkerManagerGetWorkerPoolErrorDeprecatedFn = {
 (
   error_id_in: string,
   worker_pool_id_in: string
 ): Promise<Array<{error_id: string, worker_pool_id: string, reported: Date, kind: string, title: string, description: string, extra: JsonB}>>;
 (params: {
  error_id_in: string;
  worker_pool_id_in: string;
 }): Promise<Array<{error_id: string, worker_pool_id: string, reported: Date, kind: string, title: string, description: string, extra: JsonB}>>;
};
type WorkerManagerGetWorkerPoolErrorCodesFn = {
 (
   worker_pool_id_in: string | null
 ): Promise<Array<{code: string, count: number}>>;
 (params: {
  worker_pool_id_in?: string | null;
 }): Promise<Array<{code: string, count: number}>>;
};
type WorkerManagerGetWorkerPoolErrorLaunchConfigFn = {
 (
   error_id_in: string,
   worker_pool_id_in: string
 ): Promise<Array<{error_id: string, worker_pool_id: string, reported: Date, kind: string, title: string, description: string, extra: JsonB, launch_config_id: string}>>;
 (params: {
  error_id_in: string;
  worker_pool_id_in: string;
 }): Promise<Array<{error_id: string, worker_pool_id: string, reported: Date, kind: string, title: string, description: string, extra: JsonB, launch_config_id: string}>>;
};
type WorkerManagerGetWorkerPoolErrorLaunchConfigsFn = {
 (
   worker_pool_id_in: string | null,
   reported_since_in: Date | null
 ): Promise<Array<{worker_pool: string, launch_config_id: string, count: number}>>;
 (params: {
  worker_pool_id_in?: string | null;
  reported_since_in?: Date | null;
 }): Promise<Array<{worker_pool: string, launch_config_id: string, count: number}>>;
};
type WorkerManagerGetWorkerPoolErrorStatsLast24HoursFn = {
 (
   worker_pool_id_in: string | null
 ): Promise<Array<{hour: Date, count: number}>>;
 (params: {
  worker_pool_id_in?: string | null;
 }): Promise<Array<{hour: Date, count: number}>>;
};
type WorkerManagerGetWorkerPoolErrorStatsLast7DaysFn = {
 (
   worker_pool_id_in: string | null
 ): Promise<Array<{day: Date, count: number}>>;
 (params: {
  worker_pool_id_in?: string | null;
 }): Promise<Array<{day: Date, count: number}>>;
};
type WorkerManagerGetWorkerPoolErrorTitlesFn = {
 (
   worker_pool_id_in: string | null
 ): Promise<Array<{title: string, count: number}>>;
 (params: {
  worker_pool_id_in?: string | null;
 }): Promise<Array<{title: string, count: number}>>;
};
type WorkerManagerGetWorkerPoolErrorWorkerPoolsFn = {
 (
   worker_pool_id_in: string | null
 ): Promise<Array<{worker_pool: string, count: number}>>;
 (params: {
  worker_pool_id_in?: string | null;
 }): Promise<Array<{worker_pool: string, count: number}>>;
};
/** @deprecated */
type WorkerManagerGetWorkerPoolErrorsDeprecatedFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{error_id: string, worker_pool_id: string, reported: Date, kind: string, title: string, description: string, extra: JsonB}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{error_id: string, worker_pool_id: string, reported: Date, kind: string, title: string, description: string, extra: JsonB}>>;
};
/** @deprecated */
type WorkerManagerGetWorkerPoolErrorsForWorkerPoolDeprecatedFn = {
 (
   error_id_in: string | null,
   worker_pool_id_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{error_id: string, worker_pool_id: string, reported: Date, kind: string, title: string, description: string, extra: JsonB}>>;
 (params: {
  error_id_in?: string | null;
  worker_pool_id_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{error_id: string, worker_pool_id: string, reported: Date, kind: string, title: string, description: string, extra: JsonB}>>;
};
type WorkerManagerGetWorkerPoolErrorsForWorkerPool2Fn = {
 (
   error_id_in: string | null,
   worker_pool_id_in: string | null,
   launch_config_id_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{error_id: string, worker_pool_id: string, reported: Date, kind: string, title: string, description: string, extra: JsonB, launch_config_id: string}>>;
 (params: {
  error_id_in?: string | null;
  worker_pool_id_in?: string | null;
  launch_config_id_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{error_id: string, worker_pool_id: string, reported: Date, kind: string, title: string, description: string, extra: JsonB, launch_config_id: string}>>;
};
type WorkerManagerGetWorkerPoolLaunchConfigStatsFn = {
 (
   worker_pool_id_in: string
 ): Promise<Array<{state: string, launch_config_id: string, count: any}>>;
 (params: {
  worker_pool_id_in: string;
 }): Promise<Array<{state: string, launch_config_id: string, count: any}>>;
};
type WorkerManagerGetWorkerPoolLaunchConfigsFn = {
 (
   worker_pool_id_in: string,
   is_archived_in: boolean | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{launch_config_id: string, worker_pool_id: string, is_archived: boolean, configuration: JsonB, created: any, last_modified: any}>>;
 (params: {
  worker_pool_id_in: string;
  is_archived_in?: boolean | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{launch_config_id: string, worker_pool_id: string, is_archived: boolean, configuration: JsonB, created: any, last_modified: any}>>;
};
/** @deprecated */
type WorkerManagerGetWorkerPoolWithCapacityDeprecatedFn = {
 (
   worker_pool_id_in: string
 ): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB, current_capacity: number}>>;
 (params: {
  worker_pool_id_in: string;
 }): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB, current_capacity: number}>>;
};
/** @deprecated */
type WorkerManagerGetWorkerPoolWithCapacityAndCountsByStateDeprecatedFn = {
 (
   worker_pool_id_in: string
 ): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB, current_capacity: number, requested_count: number, running_count: number, stopping_count: number, stopped_count: number, requested_capacity: number, running_capacity: number, stopping_capacity: number, stopped_capacity: number}>>;
 (params: {
  worker_pool_id_in: string;
 }): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB, current_capacity: number, requested_count: number, running_count: number, stopping_count: number, stopped_count: number, requested_capacity: number, running_capacity: number, stopping_capacity: number, stopped_capacity: number}>>;
};
type WorkerManagerGetWorkerPoolWithLaunchConfigsFn = {
 (
   worker_pool_id_in: string
 ): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB}>>;
 (params: {
  worker_pool_id_in: string;
 }): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB}>>;
};
/** @deprecated */
type WorkerManagerGetWorkerPoolsDeprecatedFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB}>>;
};
type WorkerManagerGetWorkerPoolsCountsAndCapacityFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, current_capacity: number, stopped_capacity: number, stopped_count: number, requested_capacity: number, requested_count: number, running_capacity: number, running_count: number, stopping_capacity: number, stopping_count: number}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, current_capacity: number, stopped_capacity: number, stopped_count: number, requested_capacity: number, requested_count: number, running_capacity: number, running_count: number, stopping_capacity: number, stopping_count: number}>>;
};
/** @deprecated */
type WorkerManagerGetWorkerPoolsWithCapacityDeprecatedFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB, current_capacity: number}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB, current_capacity: number}>>;
};
/** @deprecated */
type WorkerManagerGetWorkerPoolsWithCapacityAndCountsByStateDeprecatedFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB, current_capacity: number, requested_count: number, running_count: number, stopping_count: number, stopped_count: number, requested_capacity: number, running_capacity: number, stopping_capacity: number, stopped_capacity: number}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB, current_capacity: number, requested_count: number, running_count: number, stopping_count: number, stopped_count: number, requested_capacity: number, running_capacity: number, stopping_capacity: number, stopped_capacity: number}>>;
};
type WorkerManagerGetWorkerPoolsWithLaunchConfigsFn = {
 (
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB}>>;
 (params: {
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, provider_id: string, previous_provider_ids: JsonB, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, provider_data: JsonB}>>;
};
/** @deprecated */
type WorkerManagerGetWorkersDeprecatedFn = {
 (
   worker_pool_id_in: string | null,
   worker_group_in: string | null,
   worker_id_in: string | null,
   state_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date}>>;
 (params: {
  worker_pool_id_in?: string | null;
  worker_group_in?: string | null;
  worker_id_in?: string | null;
  state_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date}>>;
};
/** @deprecated */
type WorkerManagerGetWorkersWithoutProviderDataDeprecatedFn = {
 (
   worker_pool_id_in: string | null,
   worker_group_in: string | null,
   worker_id_in: string | null,
   state_in: string | null,
   page_size_in: number | null,
   page_offset_in: number | null
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, capacity: number, last_modified: Date, last_checked: Date}>>;
 (params: {
  worker_pool_id_in?: string | null;
  worker_group_in?: string | null;
  worker_id_in?: string | null;
  state_in?: string | null;
  page_size_in?: number | null;
  page_offset_in?: number | null;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, capacity: number, last_modified: Date, last_checked: Date}>>;
};
type WorkerManagerInsertWorkerManagerAuditHistoryFn = {
 (
   worker_pool_id_in: string,
   client_id_in: string,
   action_type_in: string
 ): Promise<void>;
 (params: {
  worker_pool_id_in: string;
  client_id_in: string;
  action_type_in: string;
 }): Promise<void>;
};
type WorkerManagerRemoveWorkerPoolPreviousProviderIdFn = {
 (
   worker_pool_id_in: string,
   provider_id_in: string
 ): Promise<void>;
 (params: {
  worker_pool_id_in: string;
  provider_id_in: string;
 }): Promise<void>;
};
/** @deprecated */
type WorkerManagerUpdateWorkerDeprecatedFn = {
 (
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
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, etag: string}>>;
 (params: {
  worker_pool_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  provider_id_in: string;
  created_in: Date;
  expires_in: Date;
  state_in: string;
  provider_data_in: JsonB;
  capacity_in: number;
  last_modified_in: Date;
  last_checked_in: Date;
  etag_in: string;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, etag: string}>>;
};
/** @deprecated */
type WorkerManagerUpdateWorker2DeprecatedFn = {
 (
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
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, etag: string, secret: JsonB}>>;
 (params: {
  worker_pool_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  provider_id_in: string;
  created_in: Date;
  expires_in: Date;
  state_in: string;
  provider_data_in: JsonB;
  capacity_in: number;
  last_modified_in: Date;
  last_checked_in: Date;
  etag_in: string;
  secret_in: JsonB;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, etag: string, secret: JsonB}>>;
};
type WorkerManagerUpdateWorker3Fn = {
 (
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
 ): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, etag: string, secret: JsonB, launch_config_id: string}>>;
 (params: {
  worker_pool_id_in: string;
  worker_group_in: string;
  worker_id_in: string;
  provider_id_in: string;
  created_in: Date;
  expires_in: Date;
  state_in: string;
  provider_data_in: JsonB;
  capacity_in: number;
  last_modified_in: Date;
  last_checked_in: Date;
  etag_in: string;
  secret_in: JsonB;
 }): Promise<Array<{worker_pool_id: string, worker_group: string, worker_id: string, provider_id: string, created: Date, expires: Date, state: string, provider_data: JsonB, capacity: number, last_modified: Date, last_checked: Date, etag: string, secret: JsonB, launch_config_id: string}>>;
};
/** @deprecated */
type WorkerManagerUpdateWorkerPoolDeprecatedFn = {
 (
   worker_pool_id_in: string,
   provider_id_in: string,
   description_in: string,
   config_in: JsonB,
   last_modified_in: Date,
   owner_in: string,
   email_on_error_in: boolean
 ): Promise<Array<{worker_pool_id: string, provider_id: string, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, previous_provider_id: string}>>;
 (params: {
  worker_pool_id_in: string;
  provider_id_in: string;
  description_in: string;
  config_in: JsonB;
  last_modified_in: Date;
  owner_in: string;
  email_on_error_in: boolean;
 }): Promise<Array<{worker_pool_id: string, provider_id: string, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, previous_provider_id: string}>>;
};
type WorkerManagerUpdateWorkerPoolProviderDataFn = {
 (
   worker_pool_id_in: string,
   provider_id_in: string,
   provider_data_in: JsonB
 ): Promise<void>;
 (params: {
  worker_pool_id_in: string;
  provider_id_in: string;
  provider_data_in: JsonB;
 }): Promise<void>;
};
/** @deprecated */
type WorkerManagerUpdateWorkerPoolWithCapacityDeprecatedFn = {
 (
   worker_pool_id_in: string,
   provider_id_in: string,
   description_in: string,
   config_in: JsonB,
   last_modified_in: Date,
   owner_in: string,
   email_on_error_in: boolean
 ): Promise<Array<{worker_pool_id: string, provider_id: string, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, previous_provider_id: string, current_capacity: number}>>;
 (params: {
  worker_pool_id_in: string;
  provider_id_in: string;
  description_in: string;
  config_in: JsonB;
  last_modified_in: Date;
  owner_in: string;
  email_on_error_in: boolean;
 }): Promise<Array<{worker_pool_id: string, provider_id: string, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, previous_provider_id: string, current_capacity: number}>>;
};
/** @deprecated */
type WorkerManagerUpdateWorkerPoolWithCapacityAndCountsByStateDeprecatedFn = {
 (
   worker_pool_id_in: string,
   provider_id_in: string,
   description_in: string,
   config_in: JsonB,
   last_modified_in: Date,
   owner_in: string,
   email_on_error_in: boolean
 ): Promise<Array<{worker_pool_id: string, provider_id: string, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, previous_provider_id: string, current_capacity: number, requested_count: number, running_count: number, stopping_count: number, stopped_count: number, requested_capacity: number, running_capacity: number, stopping_capacity: number, stopped_capacity: number}>>;
 (params: {
  worker_pool_id_in: string;
  provider_id_in: string;
  description_in: string;
  config_in: JsonB;
  last_modified_in: Date;
  owner_in: string;
  email_on_error_in: boolean;
 }): Promise<Array<{worker_pool_id: string, provider_id: string, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, previous_provider_id: string, current_capacity: number, requested_count: number, running_count: number, stopping_count: number, stopped_count: number, requested_capacity: number, running_capacity: number, stopping_capacity: number, stopped_capacity: number}>>;
};
type WorkerManagerUpdateWorkerPoolWithLaunchConfigsFn = {
 (
   worker_pool_id_in: string,
   provider_id_in: string,
   description_in: string,
   config_in: JsonB,
   last_modified_in: Date,
   owner_in: string,
   email_on_error_in: boolean
 ): Promise<Array<{worker_pool_id: string, provider_id: string, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, previous_provider_id: string, updated_launch_configs: any, created_launch_configs: any, archived_launch_configs: any}>>;
 (params: {
  worker_pool_id_in: string;
  provider_id_in: string;
  description_in: string;
  config_in: JsonB;
  last_modified_in: Date;
  owner_in: string;
  email_on_error_in: boolean;
 }): Promise<Array<{worker_pool_id: string, provider_id: string, description: string, config: JsonB, created: Date, last_modified: Date, owner: string, email_on_error: boolean, previous_provider_id: string, updated_launch_configs: any, created_launch_configs: any, archived_launch_configs: any}>>;
};
type WorkerManagerUpsertWorkerPoolLaunchConfigsFn = {
 (
   worker_pool_id_in: string,
   config_in: JsonB
 ): Promise<Array<{updated_launch_configs: any, created_launch_configs: any, archived_launch_configs: any}>>;
 (params: {
  worker_pool_id_in: string;
  config_in: JsonB;
 }): Promise<Array<{updated_launch_configs: any, created_launch_configs: any, archived_launch_configs: any}>>;
};
/** @deprecated */
type WorkerManagerWmworkerPoolErrorsEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ wmworker_pool_errors_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ wmworker_pool_errors_entities_create: string }]>;
};
/** @deprecated */
type WorkerManagerWmworkerPoolErrorsEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type WorkerManagerWmworkerPoolErrorsEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type WorkerManagerWmworkerPoolErrorsEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type WorkerManagerWmworkerPoolErrorsEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type WorkerManagerWmworkerPoolsEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ wmworker_pools_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ wmworker_pools_entities_create: string }]>;
};
/** @deprecated */
type WorkerManagerWmworkerPoolsEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type WorkerManagerWmworkerPoolsEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type WorkerManagerWmworkerPoolsEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type WorkerManagerWmworkerPoolsEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type WorkerManagerWmworkersEntitiesCreateDeprecatedFn = {
 (
   pk: string,
   rk: string,
   properties: JsonB,
   overwrite: boolean,
   version: number
 ): Promise<[{ wmworkers_entities_create: string }]>;
 (params: {
  pk: string;
  rk: string;
  properties: JsonB;
  overwrite: boolean;
  version: number;
 }): Promise<[{ wmworkers_entities_create: string }]>;
};
/** @deprecated */
type WorkerManagerWmworkersEntitiesLoadDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{partition_key_out: string, row_key_out: string, value: JsonB, version: number, etag: string}>>;
};
/** @deprecated */
type WorkerManagerWmworkersEntitiesModifyDeprecatedFn = {
 (
   partition_key: string,
   row_key: string,
   properties: JsonB,
   version: number,
   old_etag: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
  properties: JsonB;
  version: number;
  old_etag: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type WorkerManagerWmworkersEntitiesRemoveDeprecatedFn = {
 (
   partition_key: string,
   row_key: string
 ): Promise<Array<{etag: string}>>;
 (params: {
  partition_key: string;
  row_key: string;
 }): Promise<Array<{etag: string}>>;
};
/** @deprecated */
type WorkerManagerWmworkersEntitiesScanDeprecatedFn = {
 (
   pk: string,
   rk: string,
   condition: string,
   size: number,
   page: number
 ): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
 (params: {
  pk: string;
  rk: string;
  condition: string;
  size: number;
  page: number;
 }): Promise<Array<{partition_key: string, row_key: string, value: JsonB, version: number, etag: string}>>;
};
export interface DbFunctions {

  // Auth
  create_client: AuthCreateClientFn;
  delete_client: AuthDeleteClientFn;
  expire_clients_return_client_ids: AuthExpireClientsReturnClientIdsFn;
  get_client: AuthGetClientFn;
  get_clients: AuthGetClientsFn;
  get_combined_audit_history: AuthGetCombinedAuditHistoryFn;
  get_roles: AuthGetRolesFn;
  insert_auth_audit_history: AuthInsertAuthAuditHistoryFn;
  modify_roles: AuthModifyRolesFn;
  purge_audit_history: AuthPurgeAuditHistoryFn;
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
  get_hook_groups: HooksGetHookGroupsFn;
  get_hooks: HooksGetHooksFn;
  get_hooks_queues: HooksGetHooksQueuesFn;
  get_last_fire: HooksGetLastFireFn;
  get_last_fires_with_task_state: HooksGetLastFiresWithTaskStateFn;
  insert_hooks_audit_history: HooksInsertHooksAuditHistoryFn;
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
  get_claimed_tasks_by_worker: QueueGetClaimedTasksByWorkerFn;
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
  queue_change_task_group_priority: QueueQueueChangeTaskGroupPriorityFn;
  queue_change_task_priority: QueueQueueChangeTaskPriorityFn;
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
  queue_worker_stats: QueueQueueWorkerStatsFn;
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
  expire_secrets_return_names: SecretsExpireSecretsReturnNamesFn;
  get_secret: SecretsGetSecretFn;
  get_secrets: SecretsGetSecretsFn;
  insert_secrets_audit_history: SecretsInsertSecretsAuditHistoryFn;
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
  collect_launch_configs_if_exist: WorkerManagerCollectLaunchConfigsIfExistFn;
  create_worker_pool_error_launch_config: WorkerManagerCreateWorkerPoolErrorLaunchConfigFn;
  create_worker_pool_launch_config: WorkerManagerCreateWorkerPoolLaunchConfigFn;
  create_worker_pool_with_launch_configs: WorkerManagerCreateWorkerPoolWithLaunchConfigsFn;
  create_worker_with_lc: WorkerManagerCreateWorkerWithLcFn;
  delete_worker: WorkerManagerDeleteWorkerFn;
  delete_worker_pool: WorkerManagerDeleteWorkerPoolFn;
  delete_worker_pool_error: WorkerManagerDeleteWorkerPoolErrorFn;
  expire_worker_pool_errors: WorkerManagerExpireWorkerPoolErrorsFn;
  expire_worker_pool_launch_configs: WorkerManagerExpireWorkerPoolLaunchConfigsFn;
  expire_worker_pools: WorkerManagerExpireWorkerPoolsFn;
  expire_workers: WorkerManagerExpireWorkersFn;
  get_non_stopped_workers_with_launch_config_scanner: WorkerManagerGetNonStoppedWorkersWithLaunchConfigScannerFn;
  get_queue_worker_with_wm_data: WorkerManagerGetQueueWorkerWithWmDataFn;
  get_queue_workers_with_wm_data: WorkerManagerGetQueueWorkersWithWmDataFn;
  get_task_queue_wm_2: WorkerManagerGetTaskQueueWm2Fn;
  get_task_queues_wm: WorkerManagerGetTaskQueuesWmFn;
  get_worker_3: WorkerManagerGetWorker3Fn;
  get_worker_manager_workers2: WorkerManagerGetWorkerManagerWorkers2Fn;
  get_worker_pool_counts_and_capacity: WorkerManagerGetWorkerPoolCountsAndCapacityFn;
  get_worker_pool_counts_and_capacity_lc: WorkerManagerGetWorkerPoolCountsAndCapacityLcFn;
  get_worker_pool_error_codes: WorkerManagerGetWorkerPoolErrorCodesFn;
  get_worker_pool_error_launch_config: WorkerManagerGetWorkerPoolErrorLaunchConfigFn;
  get_worker_pool_error_launch_configs: WorkerManagerGetWorkerPoolErrorLaunchConfigsFn;
  get_worker_pool_error_stats_last_24_hours: WorkerManagerGetWorkerPoolErrorStatsLast24HoursFn;
  get_worker_pool_error_stats_last_7_days: WorkerManagerGetWorkerPoolErrorStatsLast7DaysFn;
  get_worker_pool_error_titles: WorkerManagerGetWorkerPoolErrorTitlesFn;
  get_worker_pool_error_worker_pools: WorkerManagerGetWorkerPoolErrorWorkerPoolsFn;
  get_worker_pool_errors_for_worker_pool2: WorkerManagerGetWorkerPoolErrorsForWorkerPool2Fn;
  get_worker_pool_launch_config_stats: WorkerManagerGetWorkerPoolLaunchConfigStatsFn;
  get_worker_pool_launch_configs: WorkerManagerGetWorkerPoolLaunchConfigsFn;
  get_worker_pool_with_launch_configs: WorkerManagerGetWorkerPoolWithLaunchConfigsFn;
  get_worker_pools_counts_and_capacity: WorkerManagerGetWorkerPoolsCountsAndCapacityFn;
  get_worker_pools_with_launch_configs: WorkerManagerGetWorkerPoolsWithLaunchConfigsFn;
  insert_worker_manager_audit_history: WorkerManagerInsertWorkerManagerAuditHistoryFn;
  remove_worker_pool_previous_provider_id: WorkerManagerRemoveWorkerPoolPreviousProviderIdFn;
  update_worker_3: WorkerManagerUpdateWorker3Fn;
  update_worker_pool_provider_data: WorkerManagerUpdateWorkerPoolProviderDataFn;
  update_worker_pool_with_launch_configs: WorkerManagerUpdateWorkerPoolWithLaunchConfigsFn;
  upsert_worker_pool_launch_configs: WorkerManagerUpsertWorkerPoolLaunchConfigsFn;
}

export interface DeprecatedDbFunctions {

  // Auth
  clients_entities_create: AuthClientsEntitiesCreateDeprecatedFn;
  clients_entities_load: AuthClientsEntitiesLoadDeprecatedFn;
  clients_entities_modify: AuthClientsEntitiesModifyDeprecatedFn;
  clients_entities_remove: AuthClientsEntitiesRemoveDeprecatedFn;
  clients_entities_scan: AuthClientsEntitiesScanDeprecatedFn;
  expire_clients: AuthExpireClientsDeprecatedFn;
  get_audit_history: AuthGetAuditHistoryDeprecatedFn;
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
  expire_secrets: SecretsExpireSecretsDeprecatedFn;
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
  create_worker: WorkerManagerCreateWorkerDeprecatedFn;
  create_worker_pool: WorkerManagerCreateWorkerPoolDeprecatedFn;
  create_worker_pool_error: WorkerManagerCreateWorkerPoolErrorDeprecatedFn;
  get_non_stopped_workers: WorkerManagerGetNonStoppedWorkersDeprecatedFn;
  get_non_stopped_workers_2: WorkerManagerGetNonStoppedWorkers2DeprecatedFn;
  get_non_stopped_workers_quntil: WorkerManagerGetNonStoppedWorkersQuntilDeprecatedFn;
  get_non_stopped_workers_quntil_providers: WorkerManagerGetNonStoppedWorkersQuntilProvidersDeprecatedFn;
  get_non_stopped_workers_scanner: WorkerManagerGetNonStoppedWorkersScannerDeprecatedFn;
  get_queue_worker_with_wm_join: WorkerManagerGetQueueWorkerWithWmJoinDeprecatedFn;
  get_queue_worker_with_wm_join_2: WorkerManagerGetQueueWorkerWithWmJoin2DeprecatedFn;
  get_queue_workers_with_wm_join: WorkerManagerGetQueueWorkersWithWmJoinDeprecatedFn;
  get_queue_workers_with_wm_join_quarantined: WorkerManagerGetQueueWorkersWithWmJoinQuarantinedDeprecatedFn;
  get_queue_workers_with_wm_join_quarantined_2: WorkerManagerGetQueueWorkersWithWmJoinQuarantined2DeprecatedFn;
  get_queue_workers_with_wm_join_state: WorkerManagerGetQueueWorkersWithWmJoinStateDeprecatedFn;
  get_task_queue_wm: WorkerManagerGetTaskQueueWmDeprecatedFn;
  get_worker: WorkerManagerGetWorkerDeprecatedFn;
  get_worker_2: WorkerManagerGetWorker2DeprecatedFn;
  get_worker_manager_workers: WorkerManagerGetWorkerManagerWorkersDeprecatedFn;
  get_worker_pool: WorkerManagerGetWorkerPoolDeprecatedFn;
  get_worker_pool_error: WorkerManagerGetWorkerPoolErrorDeprecatedFn;
  get_worker_pool_errors: WorkerManagerGetWorkerPoolErrorsDeprecatedFn;
  get_worker_pool_errors_for_worker_pool: WorkerManagerGetWorkerPoolErrorsForWorkerPoolDeprecatedFn;
  get_worker_pool_with_capacity: WorkerManagerGetWorkerPoolWithCapacityDeprecatedFn;
  get_worker_pool_with_capacity_and_counts_by_state: WorkerManagerGetWorkerPoolWithCapacityAndCountsByStateDeprecatedFn;
  get_worker_pools: WorkerManagerGetWorkerPoolsDeprecatedFn;
  get_worker_pools_with_capacity: WorkerManagerGetWorkerPoolsWithCapacityDeprecatedFn;
  get_worker_pools_with_capacity_and_counts_by_state: WorkerManagerGetWorkerPoolsWithCapacityAndCountsByStateDeprecatedFn;
  get_workers: WorkerManagerGetWorkersDeprecatedFn;
  get_workers_without_provider_data: WorkerManagerGetWorkersWithoutProviderDataDeprecatedFn;
  update_worker: WorkerManagerUpdateWorkerDeprecatedFn;
  update_worker_2: WorkerManagerUpdateWorker2DeprecatedFn;
  update_worker_pool: WorkerManagerUpdateWorkerPoolDeprecatedFn;
  update_worker_pool_with_capacity: WorkerManagerUpdateWorkerPoolWithCapacityDeprecatedFn;
  update_worker_pool_with_capacity_and_counts_by_state: WorkerManagerUpdateWorkerPoolWithCapacityAndCountsByStateDeprecatedFn;
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
