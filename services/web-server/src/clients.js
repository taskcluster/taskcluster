import {
  Auth,
  AwsProvisioner,
  EC2Manager,
  Github,
  Hooks,
  Index,
  PurgeCache,
  Queue,
  QueueEvents,
  Secrets,
} from 'taskcluster-client';

export default user => {
  const credentials = user && user.oidc.credentials;
  const options = credentials
    ? { credentials, rootUrl: process.env.TASKCLUSTER_ROOT_URL }
    : { rootUrl: process.env.TASKCLUSTER_ROOT_URL };

  return {
    auth: new Auth(options),
    awsProvisioner: new AwsProvisioner(options),
    ec2Manager: new EC2Manager(options),
    github: new Github(options),
    hooks: new Hooks(options),
    index: new Index(options),
    purgeCache: new PurgeCache(options),
    queue: new Queue(options),
    secrets: new Secrets(options),
    queueEvents: new QueueEvents(options),
  };
};
