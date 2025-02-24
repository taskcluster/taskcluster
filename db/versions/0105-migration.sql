begin

  DROP TABLE IF EXISTS worker_pool_launch_configs;
  CREATE TABLE worker_pool_launch_configs (
    launch_config_id text not null,
    worker_pool_id text not null,
    is_archived boolean not null,
    configuration jsonb not null,
    created timestamp with time zone not null,
    last_modified timestamp with time zone not null
  );

  CREATE UNIQUE INDEX worker_pool_launch_configs_uniq_idx ON worker_pool_launch_configs(worker_pool_id, launch_config_id);
  CREATE INDEX worker_pool_launch_configs_active_idx ON worker_pool_launch_configs(worker_pool_id) WHERE NOT is_archived;

  -- utility function to create launch config id from worker pool id and config
  -- if workerManager.launchConfig is set it will be returned instead of generated one
  -- this will ignore "workerManager" part of the config if it exists, as it can be "dynamic"
  -- and allow changing maxCapacity/initialWeight without changing the id
  CREATE OR REPLACE FUNCTION get_or_create_launch_config_id(worker_pool_id TEXT, config JSONB)
  RETURNS TEXT AS $$
  DECLARE
    cfg_without_wm JSONB;
  BEGIN
    IF jsonb_typeof(config) = 'object' THEN
      -- check if id is present and return if it is
      IF (config->>'workerManager' IS NOT NULL) AND
         (config->'workerManager'->>'launchConfigId' IS NOT NULL) THEN
        RETURN config->'workerManager'->>'launchConfigId';
      END IF;

      cfg_without_wm := config - 'workerManager';
    ELSE
      cfg_without_wm := config;
    END IF;

    RETURN 'lc-' || left(md5(worker_pool_id || cfg_without_wm::text), 20);
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
    truncate table worker_pool_launch_configs;

    FOR wp IN SELECT * FROM worker_pools LOOP
        -- Iterate through each config in the array
        FOR config IN SELECT jsonb_array_elements(wp.config->'launchConfigs') LOOP
            -- Insert into the new table
            INSERT INTO worker_pool_launch_configs (
                launch_config_id,
                worker_pool_id,
                is_archived,
                configuration,
                created,
                last_modified
            ) VALUES (
                get_or_create_launch_config_id(wp.worker_pool_id, config),
                wp.worker_pool_id,
                false, -- not archived by default
                config,
                wp.created,
                wp.last_modified
            );
        END LOOP;
    END LOOP;

    -- remove launchConfigs from worker_pools configs
    UPDATE worker_pools
    SET config = worker_pools.config - 'launchConfigs';

  END;
  $$ LANGUAGE plpgsql;

  -- migrate worker pools
  PERFORM _migrate_worker_pools_to_launch_configs();
  DROP FUNCTION _migrate_worker_pools_to_launch_configs();

  -- workers need new field
  alter table workers add column launch_config_id text null;
  CREATE INDEX workers_lc_idx ON workers(worker_pool_id, launch_config_id, state);

  -- errors also need to know where they are coming from
  alter table worker_pool_errors add column launch_config_id text null;
  CREATE INDEX worker_pool_errors_lc_idx ON worker_pool_errors(worker_pool_id, launch_config_id);

  -- allow
  GRANT select, insert, update, delete ON worker_pool_launch_configs to $db_user_prefix$_worker_manager;

end
