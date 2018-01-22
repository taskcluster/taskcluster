let debug   = require('debug')('app:dependency-tracker');
let assert  = require('assert');
let Promise = require('promise');
let _       = require('lodash');
let Entity  = require('azure-entities');

/**
 * DependencyTracker tracks dependencies between tasks and ensure that dependent
 * tasks are scheduled.
 *
 *
 * Options:
 * {
 *   Task:               data.Task instance
 *   publisher:          publisher from exchanges
 *   queueService:       QueueService instance
 *   TaskDependency:     data.TaskDependency instance
 *   TaskRequirement:    data.TaskRequirement instance
 *   TaskGroupActiveSet: data.TaskGroupMember instance
 * }
 */
class DependencyTracker {
  constructor(options = {}) {
    // Validate options
    assert(options,                    'options are required');
    assert(options.Task,               'Expected options.Task');
    assert(options.publisher,          'Expected options.publisher');
    assert(options.queueService,       'Expected options.queueService');
    assert(options.TaskDependency,     'Expected options.TaskDependency');
    assert(options.TaskRequirement,    'Expected options.TaskRequirement');
    assert(options.TaskGroupActiveSet, 'Expected options.TaskGroupActiveSet');

    // Store options on this object
    this.Task               = options.Task;
    this.publisher          = options.publisher;
    this.queueService       = options.queueService;
    this.TaskDependency     = options.TaskDependency;
    this.TaskRequirement    = options.TaskRequirement;
    this.TaskGroupActiveSet = options.TaskGroupActiveSet;
  }

  /**
   * Track dependencies for task object, and add pending run to the task object,
   * if all dependencies was resolved during creation.
   *
   * This will return {message, details} if there is an error.
   */
  async trackDependencies(task) {

    // Create TaskRequirement entries, each entry implies that taskId is blocked
    // by requiredTaskId. This relation is used to track if a taskId is blocked.
    await Promise.all(task.dependencies.map(requiredTaskId => {
      return this.TaskRequirement.create({
        taskId:           task.taskId,
        requiredTaskId,
        expires:          task.expires,
      }, true);
    }));

    // Create TaskDependency entries, each entry implies that taskId is required
    // by dependentTaskId. This relation is used so taskId can find dependent
    // tasks when it is resolved.
    let require = 'completed';
    if (task.requires === 'all-resolved') {
      require = 'resolved';
    }
    await Promise.all(task.dependencies.map(requiredTaskId => {
      return this.TaskDependency.create({
        taskId:           requiredTaskId,
        dependentTaskId:  task.taskId,
        expires:          task.expires,
        require,
      }, true);
    }));

    // Load all task dependencies to see if they have been resolved.
    // We will also check for missing and expiring dependencies.
    let missing = [];         // Dependencies that doesn't exist
    let expiring = [];        // Dependencies that expire before deadline
    let anySatisfied = false; // Track if any dependencies were satisfied
    await Promise.all(task.dependencies.map(async (requiredTaskId) => {
      let requiredTask = await this.Task.load({taskId: requiredTaskId}, true);

      // If task is missing, we should report and error
      if (!requiredTask) {
        return missing.push(requiredTaskId);
      }

      // Check if requiredTask expires before the deadline
      if (task.deadline.getTime() > requiredTask.expires.getTime()) {
        return expiring.push(requiredTaskId);
      }

      // Check if requiredTask is satisfied
      let state = requiredTask.state();
      if (state === 'completed' || task.requires === 'all-resolved' &&
          (state === 'exception' || state === 'failed')) {
        // If a dependency is satisfied we delete the TaskRequirement entry
        await this.TaskRequirement.remove({
          taskId:         task.taskId,
          requiredTaskId,
        }, true);
        // Track that we've deleted something, now we must check if any are left
        // afterward (using isBlocked)
        anySatisfied = true;
      }
    }));

    // If we found some missing dependencies we're done, createTask should
    // clearly return an error
    if (missing.length > 0 || expiring.length > 0) {
      // Construct explanatory error message
      let msg = '';
      if (missing.length > 0) {
        msg += '`task.dependencies` references non-existing tasks: \n';
        msg += missing.map(taskId => {
          return ' * ' + taskId + ',';
        }).join('\n') + '\n';
        msg += 'All taskIds in `task.dependencies` **must** exist\n';
        msg += 'before the task is created.\n';
      }
      if (expiring.length > 0) {
        msg += '`task.dependencies` references tasks that expires\n';
        msg += 'before `task.deadline` this is not allowed, see tasks: \n';
        msg += expiring.map(taskId => {
          return ' * ' + taskId + ',';
        }).join('\n') + '\n';
        msg += 'All taskIds in `task.dependencies` **must** have\n';
        msg += '`task.expires` greater than the `deadline` for this task.\n';
      }

      // We send errors if dependencies aren't defined, because undefined
      // dependencies could be defined by an attacker who that way tricks the
      // system into scheduling a task that someone else defined.
      // This is a low risk security issue, because attacker can't define the
      // task he is triggering, attacker still needs basic credentials to create
      // tasks (on any workerType).
      //
      // Effectively, if we didn't force dependencies to be defined upfront,
      // consumers could create tasks before the dependencies, allowing an
      // attacker to race. Most likely this wouldn't change what the dependent
      // tasks do, as that is part of their task.payload.
      //
      // We wish to forbid this pattern. So if dependencies aren't defined
      // upfront, we return an error. However, we can't reliably delete the task
      // definition after it has been created, because the process could crash
      // at random and client could be at the very last retry. Further more, we
      // could be racing against an attacker, trying to create and resolve the
      // dependencies.
      //
      // Our options are:
      //   A) Check if dependencies are defined before creating the task,
      //   B) Return an error after creation and attempt to delete the task.
      //
      // (A) would double the number of requests, and in 99% of the cases we
      // wouldn't find an error. (B) would mean that if there is a crash
      // server-side, we could potentially leave the task in a state where
      // dependencies can be defined and used to trigger the task.
      //
      // However, the deletion in (B) will be successful 99% of the time, so
      // legitimate consumers doing automation will be forced to defined
      // dependencies upfront. Eliminating the attack vector. Consumers will
      // only see this error while developing their automation, so the fact
      // there is a small risk the task won't be deleted isn't an attack vector.

      // First remove task and TaskDependency entries
      await Promise.all([
        task.remove(true),
        Promise.all(task.dependencies.map(requiredTaskId => {
          return this.TaskDependency.remove({
            taskId:           requiredTaskId,
            dependentTaskId:  task.taskId,
          }, true);
        })),
      ]);

      // Then remove TaskRequirement entries, because removing these makes it
      // easier to trigger the task. So we remove them after removing the task.
      await Promise.all([
        Promise.all(task.dependencies.map(requiredTaskId => {
          return this.TaskRequirement.remove({
            taskId: task.taskId,
            requiredTaskId,
          }, true);
        })),
      ]);

      return {
        message:  msg,
        details: {
          dependencies: task.dependencies,
          missingTaskDependencies: missing,
          expiringTaskDependencies: expiring,
        },
      };
    }

    // If the task isn't blocked (dependencies resolved), or it has no
    // dependencies we ensure that the first run is pending (if not already).
    if (anySatisfied && !await this.isBlocked(task.taskId) ||
        task.dependencies.length === 0) {

      await task.modify(task => {
        // Don't modify if there already is a run
        if (task.runs.length > 0) {
          return;
        }

        // Add initial run (runId = 0)
        task.runs.push({
          state:          'pending',
          reasonCreated:  'scheduled',
          scheduled:      new Date().toJSON(),
        });
      });
    }

    // We don't have any error
    return null;
  }

  /** Track resolution of a task, scheduling any dependent tasks */
  async resolveTask(taskId, taskGroupId, schedulerId, resolution) {
    assert(resolution === 'completed' || resolution === 'failed' ||
         resolution === 'exception',
         'resolution must be completed, failed or exception');

    // Create query condition
    let condition = {
      taskId: Entity.op.equal(taskId),
    };
    if (resolution !== 'completed') {
      // If the resolution wasn't 'completed', we can only remove
      // TaskRequirement entries if the 'require' relation is 'resolved'.
      condition.require = Entity.op.equal('resolved');
    }

    await this.TaskDependency.query(condition, {
      limit: 250,
      handler: async (dep) => {
        // Remove the requirement that is blocking
        await this.TaskRequirement.remove({
          taskId:         dep.dependentTaskId,
          requiredTaskId: taskId,
        }, true);
        // TODO: Use return code from the remove statement to avoid checking
        //       isBlocked(...) if no requirement was deleted.
        //       Note, this will only work if we assume deletion happened, in
        //       cases where a retry is necessary. Hence, this optimization
        //       requires some mechanism to cheaply signal if retry or deletion
        //       occurred. We can do that if this slow.

        if (!await this.isBlocked(dep.dependentTaskId)) {
          await this.scheduleTask(dep.dependentTaskId);
        }
      },
    });

    await this.updateTaskGroupActiveSet(taskId, taskGroupId, schedulerId);
  }

  /** Returns true, if some task requirement is blocking the task */
  async isBlocked(taskId) {
    let result = await this.TaskRequirement.query({taskId}, {limit: 1});

    // Ensure that we can in-fact make emptiness in a single request. It seems
    // logical that we can. But Microsoft Azure documentation is sketchy, so
    // we better not make assumptions about their APIs being sane. But since
    // we're not filtering here I fully expect that we should able to get the
    // first entry. Just we could if we specified both partitionKey and rowKey.
    if (result.entries.length === 0 && result.continuation) {
      let err = new Error('Single request emptiness check invariant failed. ' +
                          'This is a flawed assumption in isBlocked()');
      err.taskId = taskId;
      err.result = result;
      throw err;
    }

    // If we have any entries the taskId is blocked!
    return result.entries.length > 0;
  }

  /**
   * Remove a resolved task from the working set and check for task-group resolution
   *
   * If a task-group has no active tasks left in it, we are free to send a message
   * that the group is "resolved" for the time being.
   */
  async updateTaskGroupActiveSet(taskId, taskGroupId, schedulerId) {
    await this.TaskGroupActiveSet.remove({taskId, taskGroupId}, true);

    // check for emptiness of the partition
    let result = await this.TaskGroupActiveSet.query({taskGroupId}, {limit: 1});

    // We assume this generally won't happen, see comment in isBlocked(...)
    // which also uses a query operation with limit = 1 to check for partition emptiness.
    if (result.entries.length === 0 && result.continuation) {
      let err = new Error('Single request emptiness check invariant failed. ' +
                          'This is a flawed assumption in resolveTask()');
      err.taskId = taskId;
      err.taskGroupId = taskGroupId;
      err.result = result;
      throw err;
    }

    if (result.entries.length == 0) {
      await this.publisher.taskGroupResolved({
        taskGroupId,
        schedulerId,
      }, []);
    }
  }

  /**
   * Schedule a task given the task or taskId.
   *
   * returns status structure if successful, null if unable to schedule either
   * because it could load it or deadline was exceeded.
   */
  async scheduleTask(taskOrTaskId) {
    // Load task, if not already loaded
    let task = taskOrTaskId;
    if (typeof task === 'string') {
      task = await this.Task.load({taskId: taskOrTaskId}, true);

      if (!task) {
        // This happens if we fail half-way through a createTask call.
        // It's not really a bug, but it's worth noticing. If it happens a lot
        // then clearly it's a bug. Occasional occurrences are expected...
        console.log('scheduleTask was told to schedule: %s, but it does not ' +
                    'exist, it was probably never created!', taskOrTaskId);
        return null;
      }
    }

    // Don't attempt to schedule tasks past their deadline
    if (task.deadline.getTime() < new Date().getTime()) {
      return null;
    }

    // Ensure that we have an initial run
    await task.modify(task => {
      // Don't modify if there already is a run
      if (task.runs.length > 0) {
        return;
      }

      // Add initial run (runId = 0)
      task.runs.push({
        state:          'pending',
        reasonCreated:  'scheduled',
        scheduled:      new Date().toJSON(),
      });
    });

    // Construct status structure
    let status = task.status();

    // Put message in appropriate azure queue, and publish message to pulse,
    // if the initial run is pending
    if (task.runs[0].state === 'pending') {
      await Promise.all([
        this.queueService.putPendingMessage(task, 0),
        this.publisher.taskPending({
          status:         status,
          runId:          0,
        }, task.routes),
      ]);
    }

    return status;
  }
};

// Export DependencyTracker
module.exports = DependencyTracker;
