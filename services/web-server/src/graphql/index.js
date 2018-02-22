import Schema from '../entities/Schema';
import * as Root from './Root';
import * as TaskRun from './TaskRun';
import * as Task from './Task';
import * as TaskStatus from './TaskStatus';
import * as TaskGroup from './TaskGroup';
import * as Artifact from './Artifact';
import * as LinkTaskAndStatus from './links/LinkTaskAndStatus';
import * as LinkTaskRunAndArtifacts from './links/LinkTaskRunAndArtifacts';

export default new Schema()
  .use(Root)
  .use(TaskRun)
  .use(Task)
  .use(TaskStatus)
  .use(TaskGroup)
  .use(Artifact)
  .use(LinkTaskAndStatus)
  .use(LinkTaskRunAndArtifacts)
  .output();
