import helper from '../helper.js';
import testing from '@taskcluster/lib-testing';
const tableNames = [
  'clients_entities',
  'roles_entities',
  'taskcluster_github_builds_entities',
  'taskcluster_integration_owners_entities',
  'taskcluster_checks_to_tasks_entities',
  'taskcluster_check_runs_entities',
  'hooks_entities',
  'queues_entities',
  'last_fire_3_entities',
  'indexed_tasks_entities',
  'namespaces_entities',
  'denylisted_notification_entities',
  'cache_purges_entities',
  'queue_tasks_entities',
  'queue_artifacts_entities',
  'queue_task_groups_entities',
  'queue_task_group_members_entities',
  'queue_task_group_active_sets_entities',
  'queue_task_requirement_entities',
  'queue_task_dependency_entities',
  'queue_worker_entities',
  'queue_worker_type_entities',
  'queue_provisioner_entities',
  'secrets_entities',
  'authorization_codes_table_entities',
  'access_token_table_entities',
  'wmworkers_entities',
  'wmworker_pools_entities',
  'wmworker_pool_errors_entities',
];

suite(testing.suiteName(), () => {
  helper.withDbForVersion();

  /* Note that these tests run in order */

  test(`tables created on upgrade`, async () => {
    await helper.upgradeTo(1);

    for (const tableName of tableNames) {
      await helper.assertNoTable(tableName);
    }

    await helper.upgradeTo(2);

    for (const tableName of tableNames) {
      await helper.assertTable(tableName);
    }
  });

  test(`tables dropped on downgrade`, async () => {
    await helper.downgradeTo(1);
    for (const tableName of tableNames) {
      await helper.assertNoTable(tableName);
    }
  });
});
