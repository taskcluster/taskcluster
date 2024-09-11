begin

  -- restore worker-pool config settings config
  -- in the next version which will drop launchConfigs from worker_pools
  update worker_pools
  set config = jsonb_set(
      worker_pools.config,
      '{launchConfigs}',
      COALESCE(
      (
          SELECT jsonb_agg(wplc.configuration)
          FROM worker_pool_launch_configs wplc
          WHERE wplc.worker_pool_id = worker_pools.worker_pool_id
          AND wplc.is_archived = false
      ), '[]'::jsonb
      )
  )
  where worker_pools.provider_id NOT IN ('static', 'standalone', 'null-provider');

  -- if config section is dropped, restore back all launch configs into wp config
  drop table if exists worker_pool_launch_configs;

  alter table workers drop column launch_config_id;

  alter table worker_pool_errors drop column launch_config_id;

end
