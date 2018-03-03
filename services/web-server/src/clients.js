import {
  Auth,
  AwsProvisioner,
  Hooks,
  Index,
  PulseConnection,
  PulseListener,
  PurgeCache,
  Queue,
  QueueEvents,
  Secrets,
} from 'taskcluster-client';
import PulseSubscription from './PulseSubscription';

const connection = new PulseConnection({
  username: process.env.PULSE_USERNAME,
  password: process.env.PULSE_PASSWORD,
});

export default (user, emitter) => {
  const credentials = user && user.oidc.credentials;
  const options = credentials ? { credentials } : undefined;
  const listener = emitter && new PulseListener({ connection });

  return {
    auth: new Auth(options),
    awsProvisioner: new AwsProvisioner(options),
    hooks: new Hooks(options),
    index: new Index(options),
    purgeCache: new PurgeCache(options),
    queue: new Queue(options),
    secrets: new Secrets(options),
    queueEvents: emitter && new QueueEvents(options),
    pulseSubscription: emitter && new PulseSubscription({ listener, emitter }),
  };
};
