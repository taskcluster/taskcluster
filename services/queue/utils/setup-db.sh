

#sudo su -u postgres

dropdb queue
createdb queue
psql queue -f <<SCHEMA

drop role if exists queue;
create user queue password 'queue';

-- store jobs
create table tasks (
    task_id uuid primary key,
    task_object text,
    state varchar(255),
    priority integer,
    max_pending_seconds integer,
    max_runtime_seconds integer,
    entered_queue_time timestamp,
    started_running_time timestamp,
    finished_time timestamp,
    worker_id integer,
    job_results text
);
grant all privileges on table Job to jobqueue;

-- what we know about workers
-- TODO: add authentication stuff, etc.
create table Worker (
    worker_id integer primary key
);
grant all privileges on table Worker to jobqueue;

SCHEMA

echo "local  all  all  md5" >> /etc/postgresql/9.1/main/pg_hba.conf

