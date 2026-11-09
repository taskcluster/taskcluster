import { omit } from 'ramda';
import cloneDeep from 'lodash.clonedeep';
import fromNowJSON from './fromNowJSON';
import { TASK_ADDED_FIELDS } from './constants';

// Transform task to an interactive task
export default task => {
  const clone = cloneDeep(task);
  const payload = omit(['artifacts', 'cache'], clone.payload || {});

  return {
    ...omit(
      [
        ...TASK_ADDED_FIELDS,
        'taskGroupId',
        'routes',
        'dependencies',
        'requires',
        'scopes',
        'payload',
      ],
      clone
    ),
    retries: 0,
    deadline: fromNowJSON('12 hours'),
    created: fromNowJSON(),
    expires: fromNowJSON('7 days'),
    // Delete cache scopes
    scopes: task.scopes.filter(scope => !/^docker-worker:cache:/.test(scope)),
    payload: {
      ...payload,
      maxRunTime: Math.max(payload.maxRunTime ?? 0, 3 * 60 * 60),
      features: { ...payload.features, interactive: true },
      env: { ...payload.env, TASKCLUSTER_INTERACTIVE: 'true' },
    },
  };
};
