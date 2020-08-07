begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table worker_pools;

  create table worker_specs (
    worker_pool_id text not null,
    worker_spec_id uuid not null,
    provider_id text not null,
    created timestamp with time zone,
    utility double precision not null,
    capacity integer not null,
    provider_config jsonb not null,
    worker_config jsonb not null,
    lifecycle jsonb not null
  );
  alter table worker_specs add primary key (worker_pool_id, worker_spec_id);

  with specs as (
    select
      worker_pool_id,
      provider_id,
      created,
      config,
      jsonb_array_elements((config ->> 'launchConfigs')::jsonb) as lcs
    from worker_pools
  ) insert into worker_specs select
    worker_pool_id,
    public.gen_random_uuid(),
    provider_id,
    created,
    1.0,
    (lcs ->> 'capacityPerInstance')::integer,
    lcs - 'capacityPerInstance' - 'workerConfig',
    (lcs ->> 'workerConfig')::jsonb,
    (config ->> 'lifecycle')::jsonb
  from specs;

  update worker_pools set config = config - 'launchConfigs' - 'lifecycle';

  grant select, insert, update, delete on worker_specs to $db_user_prefix$_worker_manager;
end
