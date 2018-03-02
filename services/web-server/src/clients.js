import {
  Auth,
  AwsProvisioner,
  Hooks,
  Index,
  PurgeCache,
  Queue,
} from 'taskcluster-client';

export default user => {
  const credentials = user && user.oidc.credentials;
  const options = credentials ? { credentials } : undefined;

  return {
    queue: new Queue(options),
    auth: new Auth(options),
    awsProvisioner: new AwsProvisioner(options),
    hooks: new Hooks(options),
    index: new Index(options),
    purgeCache: new PurgeCache(options),
  };
};
