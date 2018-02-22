import { Queue } from 'taskcluster-client';

export default user => {
  const credentials = user && user.oidc.credentials;
  const options = credentials ? { credentials } : undefined;

  return {
    queue: new Queue(options),
  };
};
