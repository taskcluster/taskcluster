begin
  -- In an effort to support worker reregistration, an encrypted secret column is required.
  -- https://github.com/taskcluster/taskcluster/issues/3011
  alter table workers
    add column secret jsonb default null;
end
