import merge from 'deepmerge';
import { satisfiesExpression } from 'taskcluster-lib-scopes';
import cloneDeep from 'lodash.clonedeep';
import jsone from 'json-e';
import { safeLoad } from 'js-yaml';
import removeKeys from '../../utils/removeKeys';
import { nice } from '../../utils/slugid';
import expandScopesQuery from './expandScopes.graphql';
import triggerHookQuery from './triggerHook.graphql';
import createTaskQuery from './createTask.graphql';
import validateActionsJson from '../../utils/validateActionsJson';
import ajv from '../../utils/ajv';

export default async ({ task, form, action, apolloClient, taskActions }) => {
  const actions = removeKeys(cloneDeep(taskActions), ['__typename']);
  const taskGroup = task.taskId === task.taskGroupId ? task : task.taskGroup;
  const input = safeLoad(form);
  const validate = ajv.compile(action.schema || {});
  const valid = validate(input);
  const validateActionsJsonInstance = await validateActionsJson();
  const validActionsJson = validateActionsJsonInstance(actions);

  if (!validActionsJson) {
    throw new Error(ajv.errorsText(validateActionsJsonInstance.errors));
  }

  if (!valid) {
    throw new Error(ajv.errorsText(validateActionsJsonInstance.errors));
  }

  const context = merge(
    {
      taskGroupId: task.taskGroupId,
      taskId: task.taskId,
      task,
      input,
    },
    actions.variables
  );

  if (action.kind === 'task') {
    const ownTaskId = nice();

    context.ownTaskId = ownTaskId;

    const newTask = jsone(action.task, context);

    await apolloClient.mutate({
      mutation: createTaskQuery,
      variables: {
        taskId: ownTaskId,
        task: {
          ...newTask,
          // Call the queue with the decision task's scopes,
          // as directed by the action spec
          options: {
            authorizedScopes: taskGroup.scopes || [],
          },
        },
      },
    });

    return ownTaskId;
  }

  // Case where action.kind === 'hook'
  const hookPayload = jsone(action.hookPayload, context);
  const { hookId, hookGroupId } = action;
  // verify that the decision task has
  // the appropriate in-tree:action-hook:.. scope
  const {
    data: { expandScopes },
  } = await apolloClient.query({
    query: expandScopesQuery,
    variables: {
      scopes: taskGroup.scopes || [],
    },
  });
  const expression = `in-tree:hook-action:${hookGroupId}/${hookId}`;

  if (!satisfiesExpression(expandScopes, expression)) {
    throw new Error(
      `Action is misconfigured: decision task's scopes do not satisfy ${expression}`
    );
  }

  const result = await apolloClient.mutate({
    mutation: triggerHookQuery,
    variables: {
      hookGroupId,
      hookId,
      payload: hookPayload,
    },
  });

  return result.data.triggerHook.taskId;
};
