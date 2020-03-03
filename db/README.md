# Taskcluster Database

This directory defines the Taskcluster database:

* `versions/` -- the migrations that create the most-recent database schema
* `test/` -- tests for the contents of this directory
* `src/` -- implementation of the JS interface to the DB

## List of Stored Functions

<!-- SP BEGIN -->
### auth

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| clients_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| clients_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| clients_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| clients_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| clients_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| roles_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| roles_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| roles_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| roles_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| roles_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
### github

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| taskcluster_check_runs_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| taskcluster_check_runs_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| taskcluster_check_runs_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| taskcluster_check_runs_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| taskcluster_check_runs_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| taskcluster_checks_to_tasks_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| taskcluster_checks_to_tasks_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| taskcluster_checks_to_tasks_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| taskcluster_checks_to_tasks_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| taskcluster_checks_to_tasks_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| taskcluster_github_builds_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| taskcluster_github_builds_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| taskcluster_github_builds_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| taskcluster_github_builds_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| taskcluster_github_builds_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| taskcluster_intergration_owners_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| taskcluster_intergration_owners_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| taskcluster_intergration_owners_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| taskcluster_intergration_owners_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| taskcluster_intergration_owners_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
### hooks

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| hooks_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| hooks_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| hooks_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| hooks_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| hooks_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| last_fire3_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| last_fire3_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| last_fire3_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| last_fire3_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| last_fire3_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| queues_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| queues_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| queues_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| queues_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| queues_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
### index

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| indexed_tasks_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| indexed_tasks_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| indexed_tasks_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| indexed_tasks_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| indexed_tasks_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| namespaces_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| namespaces_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| namespaces_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| namespaces_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| namespaces_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
### notify

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| denylisted_notification_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| denylisted_notification_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| denylisted_notification_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| denylisted_notification_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| denylisted_notification_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| update_widgets | write | name_in text | table (name text) | Temporary method to test infrastructure support fo database access |
### purge_cache

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| cache_purges_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| cache_purges_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| cache_purges_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| cache_purges_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| cache_purges_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
### queue

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| queue_artifcats_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| queue_artifcats_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| queue_artifcats_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| queue_artifcats_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| queue_provisioner_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| queue_provisioner_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| queue_provisioner_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| queue_provisioner_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| queue_provisioner_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| queue_task_dependency_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| queue_task_dependency_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| queue_task_dependency_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| queue_task_dependency_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| queue_task_dependency_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| queue_task_group_active_sets_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| queue_task_group_active_sets_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| queue_task_group_active_sets_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| queue_task_group_active_sets_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| queue_task_group_active_sets_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| queue_task_groups_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| queue_task_groups_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| queue_task_groups_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| queue_task_groups_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| queue_task_groups_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| queue_task_requirement_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| queue_task_requirement_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| queue_task_requirement_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| queue_task_requirement_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| queue_task_requirement_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| queue_tasks_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| queue_tasks_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| queue_tasks_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| queue_tasks_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| queue_tasks_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| queue_worker_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| queue_worker_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| queue_worker_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| queue_worker_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| queue_worker_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| queue_worker_type_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| queue_worker_type_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| queue_worker_type_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| queue_worker_type_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| queue_worker_type_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
### queue_artifcats_entitie

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| queue_artifcats_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
### secrets

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| secrets_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| secrets_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| secrets_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| secrets_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| secrets_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
### web_server

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| access_token_table_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| access_token_table_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| access_token_table_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| access_token_table_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| access_token_table_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| authorization_codes_table_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| authorization_codes_table_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| authorization_codes_table_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| authorization_codes_table_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| authorization_codes_table_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| github_access_token_table_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| github_access_token_table_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| github_access_token_table_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| github_access_token_table_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| github_access_token_table_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| session_storage_table_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| session_storage_table_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| session_storage_table_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| session_storage_table_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| session_storage_table_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
### worker_manager

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| wm_worker_pool_errors_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| wm_worker_pool_errors_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| wm_worker_pool_errors_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| wm_worker_pool_errors_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| wm_worker_pool_errors_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| wm_worker_pools_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| wm_worker_pools_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| wm_worker_pools_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| wm_worker_pools_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| wm_worker_pools_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
| wm_workers_entities_create | write | pk text, rk text, properties jsonb, overwrite boolean, version integer | uuid | test |
| wm_workers_entities_load | read | partition_key text, row_key text | table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid) | test |
| wm_workers_entities_modify | write | partition_key text, row_key text, properties jsonb, version integer, old_etag uuid | table (etag uuid) | Modify an entity. If the modify operation is succesful, the etag is returned in a set.<br />Else, an error will be raised with the following error code:<br />* 'P0004' - update was unsuccessful (e.g., the etag value did not match)<br />* 'P0002' - entry not found in the table (i.e., no such row)<br /> |
| wm_workers_entities_remove | write | partition_key text, row_key text | table (etag uuid) | test |
| wm_workers_entities_scan | read | pk text, rk text, condition text, size integer, page integer | table (partition_key text, row_key text, value jsonb, version integer, etag uuid) | test |
<!-- SP END -->

## Database Schema

The database schema is handled by [taskcluster-lib-postgres](../libraries/postgres).
Each database version is defined in `db/versions/####.yml`, numbered sequentially, as decribed in that library's documentation.

### Changing the Database

It's not permitted to change an existing version file (`db/versions/*.yml`) [*].
Instead, any change to the DB must be made by adding a new version.
This allows deployments of Taskcluster to follow those changes smoothly.

> [*] There are a few exceptions: fixing bugs in a version that has not yet been included in a Taskcluster release, and updating stored-function descriptions.

A version file has a `migrationScript` which performs the change to the database.
This can use any Postgres functionality required to make the change.
In some cases, that's as simple as `CREATE TABLE` or `ALTER TABLE`, but can also involve temporary tables and complex data manipulation.
The script runs in a single transaction.

#### Checklist

The following checklist summarizes what needs to be written to modify the database.

* [ ] new version file in `db/versions` that updates all impacted stored functions
* [ ] new test script in `db/test/versions`
  * [ ] test forward migration
  * [ ] test downgrade
  * [ ] test migration after downgrade (ensuring downgrade doesn't leave stray Postgres resources around)
* for any *new* stored functions:
  * [ ] fake implementation in `db/src/fakes/<serviceName>.js`
  * [ ] tests for new functions in `db/test/fns`

#### Permissions

This script should also update database permissions as necessary.
The username prefix is substituted for `$db_user_prefix$`, so permissions can be managed with statements like

```sql
grant select on table newtable to $db_user_prefix$_someservice;
```

As a safety check, the upgrade machinery will confirm after an upgrade is complete that the permissions in the database match those in `db/access.yml`.

#### Stored Functions

Each version file should redefine any stored functions that are affected by the schema changes, and define any newly-required functions.
Unchanged functions can be omitted.
A function's signature (argument and return types) cannot change from version to version.
Instead, define a new function with a different name.

For example, if `get_widget(widgetId text) returns table (widgetWidth integer)` must be extended to also return a widget height, define a new `get_widget_with_height` method.
This approach leaves the existing method in place so that older code can continue to use it.

When a method no longer makes sense (for example, when a feature is removed), redefine the method to return an empty table or default value, as appropriate.
For example, if support for widgets is removed, `get_widget` should be redefined to always return an empty table.

#### Migration Tests

Every version should have tests defined in `db/tests/versions/`.
These tests should exercise all of the functionality of the migration script, and verify that everything is as expected.
These tests should be very thorough, as broken migration scripts cannot be easily fixed once they are included in a Taskcluster release.
Ensure that they cover every conceivable circumstance, especially if they modify existing data.

Tests typically take the form

```js
  test('...', async function() {
    await helper.upgradeTo(16); // upgrade to the previous version

    // insert some data
    await helper.withDbClient(async client => {
     ..
    });

    await helper.upgradeTo(17); // upgrade to this version

    // assert that things were migrated properly
    await helper.withDbClient(async client => {
     ..
    });
  });
```

#### Function Tests

Tests for stored functions should be in `db/tests/fns/<service-name>_test.js`.
These tests serve as unit tests for the stored functions, and also help to ensure that modifications to the stored functions do not unexpectedly change their behavior.
In most cases, existing tests for a stored function should continue to pass without modification even when a new DB version modifies the function implementation.
There are exceptions to this rule, but reviewers should carefully scrutinize any such changes to ensure they will not break compatibility.

## JS Interface

The `taskcluster-db` package exports an async `setup` function which is intended to be used in services' `main.js`:

```javascript
const tcdb = require('taskcluster-db');
// ...
  db: {
    requires: ['cfg'],
    setup: ({cfg}) => tcdb.setup({
      readDbUrl: cfg.db.readDbUrl,
      writeDbUrl: cfg.db.writeDbUrl,
      serviceName: 'queue',
    }),
  }
```

The result is a taskcluster-lib-postgres Database instance all set up and ready to use.
This uses the generated schema by default.

Similarly, the `upgrade` method will upgrade a database to the current version and set up table permissions for per-service postgres users.
To upgrade to a specific version, pass `toVersion: <number>`.
This functionality is typically used in tests, as in production deployments the deployers will run `yarn db:upgrade`.

```javascript
const tcdb = require('taskcluster-db');

setup('upgrade db', async function() {
  await tcdb.upgrade({
    adminDbUrl: process.env.TEST_DB_URL,
    usernamePrefix: 'test',
  });
});
```

Finally, to get the current Schema instance, call `tcdb.schema({})`.

All of these functions take an optional `useDbDirectory: true` option to indicate that they should read from the YAML files under `db/` instead of using the serialized format.
This approach is slower, but is appropriate for testing.

### Testing Support

For testing purposes, this package provides a completely *fake* `db` instance, implemented entirely in JS.
This means that services can be tested without access to a postgres database.

The fake database is available via

```javascript
const tcdb = require('taskcluster-db');
const fakeDb = tcdb.fakeSetup({serviceName: 'queue'});
```

All of the `fakeDb.fns.<name>` methods to which the service has access are available.
Specific helper methods are available on sub-objects, such as `fakeDb.secrets.makeSecret`.
See the source code of this package for the specific helpers that are available.

## Development

To test this library, you will need a Postgres database, running the latest release of Postgres 11.
The easiest and best way to do this is to use docker:

```shell
docker run -ti -p 127.0.0.1:5432:5432  --rm postgres:11
```

This will run Docker in the foreground in that terminal (so you'll need to use another terminal for your work, or add the `-d` flag to daemonize the container) and make that available on TCP port 5432, the "normal" postgres port.
An advantage of running in the foreground is that Postgres helpfully logs every query that it runs, which can help with debugging and testing.

*NOTE* the test siute repeatedly drops the `public` schema and re-creates it, effectively deleting all data in the database.
Do not run these tests against a database instance that contains any useful data!

Once this container is running, set TEST_DB_URL to point to the database, as defined by [node-postgres](https://node-postgres.com/features/connecting).
For the docker container described above, use

```shell
export TEST_DB_URL=postgresql://postgres@localhost/postgres
```
