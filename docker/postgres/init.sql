CREATE USER taskcluster PASSWORD 'taskcluster';
GRANT ALL ON DATABASE taskcluster TO taskcluster WITH GRANT OPTION;
CREATE USER taskcluster_auth PASSWORD 'auth_password';
CREATE USER taskcluster_github PASSWORD 'github_password';
CREATE USER taskcluster_hooks PASSWORD 'hooks_password';
CREATE USER taskcluster_index PASSWORD 'index_password';
CREATE USER taskcluster_notify PASSWORD 'notify_password';
CREATE USER taskcluster_object PASSWORD 'object_password';
CREATE USER taskcluster_purge_cache PASSWORD 'purge_cache_password';
CREATE USER taskcluster_queue PASSWORD 'queue_password';
CREATE USER taskcluster_secrets PASSWORD 'secrets_password';
CREATE USER taskcluster_web_server PASSWORD 'web_server_password';
CREATE USER taskcluster_worker_manager PASSWORD 'worker_manager_password';

CREATE DATABASE "taskcluster-test";
GRANT ALL ON DATABASE "taskcluster-test" TO taskcluster;
