export const typeDefs = `
  extend type TaskRun {
    artifacts: [Artifact]
  }
`;

export const resolvers = mergeInfo => ({
  TaskRun: {
    artifacts: {
      fragment:
        'fragment TaskRunArtifactsFragment on TaskRun { taskId, runId }',
      resolve(parent, args, context, info) {
        const { taskId, runId } = parent;

        return mergeInfo.delegate(
          'query',
          'artifacts',
          { taskId, runId },
          context,
          info
        );
      },
    },
  },
});
