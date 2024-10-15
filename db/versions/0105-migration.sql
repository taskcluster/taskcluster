begin

  DROP TABLE IF EXISTS worker_pool_launch_configs;
  CREATE TABLE worker_pool_launch_configs (
    launch_config_id text not null,
    worker_pool_id text not null,
    provider_id text not null,
    is_archived boolean not null,
    is_paused boolean not null,
    configuration jsonb not null,
    created timestamp with time zone not null,
    last_modified timestamp with time zone not null
  );

  CREATE INDEX worker_pool_launch_configs_launch_config_id_idx ON worker_pool_launch_configs(launch_config_id);
  CREATE INDEX worker_pool_launch_configs_worker_pool_id_idx ON worker_pool_launch_configs(worker_pool_id);
  CREATE INDEX worker_pool_launch_configs_active_idx ON worker_pool_launch_configs(worker_pool_id) WHERE is_archived;

  -- utility function to create launch config id from worker pool id and config
  -- this will ignore "workerManager" part of the config if it exists, as it can be "dynamic"
  -- and allow changing maxCapacity/initialWeight without changing the id
  CREATE OR REPLACE FUNCTION generate_launch_config_id(worker_pool_id TEXT, provider_id TEXT, config JSONB)
  RETURNS TEXT AS $$
  DECLARE
    cfg_without_wm JSONB;
  BEGIN
    IF jsonb_typeof(config) = 'object' THEN
      cfg_without_wm := config - 'workerManager';
    ELSE
      cfg_without_wm := config;
    END IF;

    RETURN 'lc-' || left(md5(worker_pool_id || provider_id || cfg_without_wm::text), 20);
  END;
  $$ LANGUAGE plpgsql;

  -- migrate existing worker pools configs
  CREATE OR REPLACE FUNCTION _migrate_worker_pools_to_launch_configs()
  RETURNS void AS $$
  DECLARE
      wp RECORD;
      config JSONB;
      launch_config_id TEXT;
  BEGIN
    -- todo skip static and standalone
      truncate table worker_pool_launch_configs;

      -- FOR wp IN SELECT * FROM worker_pools WHERE worker_pool_id LIKE 'proj-taskcluster/%' LOOP
      FOR wp IN SELECT * FROM worker_pools LOOP
          -- Iterate through each config in the array
          FOR config IN SELECT jsonb_array_elements(wp.config->'launchConfigs') LOOP
              -- Insert into the new table
              INSERT INTO worker_pool_launch_configs (
                  launch_config_id,
                  worker_pool_id,
                  provider_id,
                  is_archived,
                  is_paused,
                  configuration,
                  created,
                  last_modified
              ) VALUES (
                  generate_launch_config_id(wp.worker_pool_id, wp.provider_id, config),
                  wp.worker_pool_id,
                  wp.provider_id,
                  false, -- not archived by default
                  false, -- not paused
                  config,
                  wp.created,
                  wp.last_modified
              );
          END LOOP;

            -- we can't drop launchConfigs from the worker pool at this point
            -- as it's used in the running processes
            -- will be updated in the next migration
            -- UPDATE worker_pools
            -- SET config = config - 'launchConfigs'
            -- WHERE worker_pool_id = wp.worker_pool_id;
      END LOOP;
  END;
  $$ LANGUAGE plpgsql;

  -- migrate worker pools
  PERFORM _migrate_worker_pools_to_launch_configs();
  DROP FUNCTION _migrate_worker_pools_to_launch_configs();


  -- workers need new field
  alter table workers add column launch_config_id text null;

  -- errors also need to know where they are coming from
  alter table worker_pool_errors add column launch_config_id text null;

  -- allow
  GRANT select, insert, update, delete ON worker_pool_launch_configs to $db_user_prefix$_worker_manager;

end
