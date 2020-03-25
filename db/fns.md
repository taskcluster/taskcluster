# Stored Functions

<!-- SP BEGIN -->
## auth

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| clients_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| clients_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| clients_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| clients_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| clients_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| roles_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| roles_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| roles_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| roles_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| roles_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
## github

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| taskcluster_check_runs_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| taskcluster_check_runs_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| taskcluster_check_runs_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| taskcluster_check_runs_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| taskcluster_check_runs_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| taskcluster_checks_to_tasks_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| taskcluster_checks_to_tasks_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| taskcluster_checks_to_tasks_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| taskcluster_checks_to_tasks_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| taskcluster_checks_to_tasks_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| taskcluster_github_builds_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| taskcluster_github_builds_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| taskcluster_github_builds_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| taskcluster_github_builds_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| taskcluster_github_builds_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| taskcluster_integration_owners_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| taskcluster_integration_owners_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| taskcluster_integration_owners_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| taskcluster_integration_owners_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| taskcluster_integration_owners_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
## hooks

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| hooks_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| hooks_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| hooks_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| hooks_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| hooks_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| last_fire_3_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| last_fire_3_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| last_fire_3_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| last_fire_3_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| last_fire_3_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queues_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| queues_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queues_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| queues_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| queues_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
## index

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| indexed_tasks_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| indexed_tasks_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| indexed_tasks_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| indexed_tasks_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| indexed_tasks_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| namespaces_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| namespaces_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| namespaces_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| namespaces_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| namespaces_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
## notify

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| denylisted_notification_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| denylisted_notification_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| denylisted_notification_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| denylisted_notification_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| denylisted_notification_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| update_widgets | write | name_in text | table (name text) | Temporary method to test infrastructure support fo database access |
## purge_cache

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| cache_purges_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| cache_purges_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| cache_purges_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| cache_purges_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| cache_purges_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
## queue

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| azure_queue_count | read | queue_name text | integer | Count non-expired messages in the named queue.<br /> |
| azure_queue_delete | write | queue_name text, message_id uuid, pop_receipt uuid | void | Delete the message identified by the given `queue_name`, `message_id` and<br />`pop_receipt`.<br /> |
| azure_queue_delete_expired | write |  | void | Delete all expired messages.  This is a maintenance task that should occur<br />about once an hour.<br /> |
| azure_queue_get | write | queue_name text, visible timestamp, count integer | table (message_id uuid, message_text text, pop_receipt uuid) | Get up to `count` messages from the given queue, setting the `visible`<br />column of each to the given value.  Returns a `message_id` and<br />`pop_receipt` for each one, for use with `azure_queue_delete` and<br />`azure_queue_update`.<br /> |
| azure_queue_put | write | queue_name text, message_text text, visible timestamp, expires timestamp | void | Put the given message into the given queue.  The message will not be visible until<br />after the visible timestamp, and will disappear after the expires timestamp.<br /> |
| azure_queue_update | write | queue_name text, message_text text, message_id uuid, pop_receipt uuid, visible timestamp | void | Update the message identified by the given `queue_name`, `message_id` and<br />`pop_receipt`, setting its `visible` and `message_text` properties as<br />given.<br /> |
| queue_artifacts_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| queue_artifacts_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_artifacts_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| queue_artifacts_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| queue_artifacts_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_provisioner_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| queue_provisioner_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_provisioner_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| queue_provisioner_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| queue_provisioner_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_task_dependency_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| queue_task_dependency_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_task_dependency_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| queue_task_dependency_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| queue_task_dependency_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_task_group_active_sets_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| queue_task_group_active_sets_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_task_group_active_sets_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| queue_task_group_active_sets_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| queue_task_group_active_sets_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_task_group_members_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| queue_task_group_members_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_task_group_members_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| queue_task_group_members_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| queue_task_group_members_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_task_groups_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| queue_task_groups_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_task_groups_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| queue_task_groups_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| queue_task_groups_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_task_requirement_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| queue_task_requirement_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_task_requirement_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| queue_task_requirement_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| queue_task_requirement_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_tasks_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| queue_tasks_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_tasks_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| queue_tasks_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| queue_tasks_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_worker_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| queue_worker_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_worker_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| queue_worker_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| queue_worker_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_worker_type_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| queue_worker_type_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| queue_worker_type_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| queue_worker_type_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| queue_worker_type_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
## secrets

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| secrets_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| secrets_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| secrets_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| secrets_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| secrets_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
## web_server

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| access_token_table_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| access_token_table_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| access_token_table_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| access_token_table_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| access_token_table_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| authorization_codes_table_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| authorization_codes_table_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| authorization_codes_table_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| authorization_codes_table_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| authorization_codes_table_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| github_access_token_table_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| github_access_token_table_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| github_access_token_table_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| github_access_token_table_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| github_access_token_table_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| session_storage_table_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| session_storage_table_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| session_storage_table_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| session_storage_table_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| session_storage_table_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
## worker_manager

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| wmworker_pool_errors_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| wmworker_pool_errors_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| wmworker_pool_errors_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| wmworker_pool_errors_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| wmworker_pool_errors_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| wmworker_pools_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| wmworker_pools_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| wmworker_pools_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| wmworker_pools_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| wmworker_pools_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| wmworkers_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | See taskcluster-lib-entities |
| wmworkers_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
| wmworkers_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | See taskcluster-lib-entities |
| wmworkers_entities_remove | write | partition_key text, row_key text | table (etag uuid) | See taskcluster-lib-entities |
| wmworkers_entities_scan | read | pk text, rk text, condition text, size integer, page_offset integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | See taskcluster-lib-entities |
<!-- SP END -->

