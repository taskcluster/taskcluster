import {
  Auth,
  AwsProvisioner,
  Hooks,
  Index,
  PurgeCache,
  Queue,
  QueueEvents,
  Secrets,
} from 'taskcluster-client';

export default user => {
  const credentials = user && user.oidc.credentials;
  const options = credentials ? { credentials } : undefined;

  return {
    auth: new Auth(options),
    awsProvisioner: new AwsProvisioner(options),
    hooks: new Hooks(options),
    index: new Index(options),
    purgeCache: new PurgeCache(options),
    queue: new Queue(options),
    secrets: new Secrets(options),
    queueEvents: new QueueEvents(options),
  };
};
