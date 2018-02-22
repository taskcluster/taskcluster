import DataLoader from 'dataloader';
import Task from '../entities/Task';
import TaskStatus from '../entities/TaskStatus';
import TaskGroup from '../entities/TaskGroup';
import Artifact from '../entities/Artifact';

export default queue => {
  const isAuthed = !!(
    queue._options.credentials.clientId &&
    queue._options.credentials.accessToken
  );
  const task = new DataLoader(taskIds =>
    Promise.all(
      taskIds.map(async taskId => {
        const task = await queue.task(taskId);

        return new Task(taskId, null, task);
      })
    )
  );
  const status = new DataLoader(taskIds =>
    Promise.all(
      taskIds.map(async taskId => {
        const { status } = await queue.status(taskId);

        return new TaskStatus(taskId, status);
      })
    )
  );
  const taskGroup = new DataLoader(connections =>
    Promise.all(
      connections.map(async ({ taskGroupId, connection }) => {
        const limit = connection.limit
          ? connection.limit > 100 ? 100 : connection.limit
          : 100;
        const continuationToken =
          connection.startCursor || connection.endCursor;
        const options = continuationToken
          ? { limit, continuationToken }
          : { limit };
        const taskGroup = await queue.listTaskGroup(taskGroupId, options);

        return new TaskGroup(taskGroupId, continuationToken, taskGroup);
      })
    )
  );
  const artifact = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ taskId, runId, name }) => {
        const artifact = await queue.getArtifact(taskId, runId, name);
        const url =
          isAuthed &&
          queue.buildSignedUrl(queue.getArtifact, taskId, runId, name);

        return new Artifact(taskId, runId, artifact, url);
      })
    )
  );
  const artifacts = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ taskId, runId }) => {
        const { artifacts } = await queue.listArtifacts(taskId, runId);

        return artifacts.map(artifact => {
          const url =
            isAuthed &&
            queue.buildSignedUrl(
              queue.getArtifact,
              taskId,
              runId,
              artifact.name
            );

          return new Artifact(taskId, runId, artifact, url);
        });
      })
    )
  );

  return {
    task,
    status,
    taskGroup,
    artifact,
    artifacts,
  };
};
