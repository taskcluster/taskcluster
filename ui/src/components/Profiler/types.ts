interface Run {
  runId: 0;
  state: TaskState; // "completed";
  reasonCreated: string; // "scheduled";
  reasonResolved: string; // "completed";
  workerGroup: string; // "built-in";
  workerId: string; // "succeed";
  takenUntil: string; // "2023-09-19T20:33:46.188Z";
  scheduled: string; // "2023-09-19T20:13:45.402Z";
  started?: string; // "2023-09-19T20:13:46.193Z";
  resolved?: string; // "2023-09-19T20:13:46.266Z";
}

export interface Task {
  provisionerId: string; // "built-in";
  workerType: string; // "succeed";
  taskQueueId: string; // "built-in/succeed";
  schedulerId: string; // "translations-level-1";
  projectId: string; // "none";
  taskGroupId: string; // "Fo1npr9eTFqsAj4DFlqBbA";
  dependencies: string[], // ["CTPPid-iT8WUEzf-j6YKUw", "Fn-77WB6SFKBuQGE62-SMg", ... ]
  requires: string; // "all-completed";
  routes: ["checks"];
  priority: string; // "low";
  retries: 5;
  created: string; // "2023-09-19T18:58:07.341Z";
  deadline: string; // "2023-09-24T18:58:07.341Z";
  expires: string; // "2023-10-17T18:58:07.341Z";
  scopes: string[]; // ["generic-worker:cache:translations-level-3-checkouts"]
  payload: {
    // This was all the same for translations.
    artifacts: [
      {
        name: "public/build",
        path: "artifacts",
        type: "directory"
      }
    ],
    // The command comes in the form of an array, e.g. ["echo", "hello"]
    command: Array<string[]>
  };
  metadata: {
    name: string; // "all-ru-en";
    owner: string; // "eu9ene@users.noreply.github.com";
    source: string; // "https://github.com/mozilla/firefox-translations-training/blob/773420ae1011f78ef58d375a75c61b65d324aa70/taskcluster/ci/all";
    description: string; // "Dummy task that ensures all parts of training pipeline will run";
  };
  tags: {
    kind: string; // "all";
    label?: string; // "all-ru-en";
    createdForUser: string; // "eu9ene@users.noreply.github.com";
    "worker-implementation": string; // "succeed";
  };
  extra: {
    index: { rank: 0 };
    parent: string; // The task's group id "Fo1npr9eTFqsAj4DFlqBbA";
  };
}

interface TaskStatus {
  taskId: string; // "ewZ4vpZbQISjhIPnU3R36g";
  provisionerId: string; // "built-in";
  workerType: string; // "succeed";
  taskQueueId: string; // "built-in/succeed";
  schedulerId: string; // "translations-level-1";
  projectId: string; // "none";
  taskGroupId: string; // "Fo1npr9eTFqsAj4DFlqBbA";
  deadline: string; // "2023-09-24T18:58:07.341Z";
  expires: string; // "2023-10-17T18:58:07.341Z";
  retriesLeft: number;
  state: TaskState; // "completed";
  runs?: Run[];
}

export interface TaskAndStatus {
  status: TaskStatus;
  task: Task;
}

export interface TaskGroup {
  taskGroupId: string, // "Fo1npr9eTFqsAj4DFlqBbA",
  schedulerId: string, // "translations-level-1",
  expires: string,// "2024-09-18T19:57:56.114Z",
  tasks: TaskAndStatus[],
  continuationToken?: string
}

export interface TimeRange {
  start: number | null;
  end: number | null;
}

type TaskState =
  | "completed"
  | "running"
  | "failed"
  | "exception"
  | "pending"
  | "unscheduled"
