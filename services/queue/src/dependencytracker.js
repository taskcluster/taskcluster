import assert from 'assert';
import { Task } from './data.js';

/**
 * DependencyTracker tracks dependencies between tasks and ensure that dependent
 * tasks are scheduled.
 *
 *
 * Options:
 * {
 *   publisher:          publisher from exchanges
 *   queueService:       QueueService instance
 * }
 */
class DependencyTracker {
  constructor(options = {}) {
    // Validate options
    assert(options, 'options are required');
    assert(options.db, 'Expected options.db');
    assert(options.publisher, 'Expected options.publisher');
    assert(options.queueService, 'Expected options.queueService');
    assert(options.monitor, 'Expected options.monitor');

    // Store options on this object
    this.db = options.db;
    this.publisher = options.publisher;
    this.queueService = options.queueService;
    this.monitor = options.monitor;
  }

  /**
   * Track dependencies for task object, and add pending run to the task object,
   * if all dependencies was resolved during creation.
   *
   * This will return {message, details} if there is an error.
   */
  async trackDependencies(task) {
    await this.db.fns.add_task_dependencies(
      task.taskId,
      JSON.stringify(task.dependencies),
      task.requires,
      task.expires,
    );

    // Load all task dependencies to see if they have been resolved.
    // We will also check for missing and expiring dependencies.
    let expiring = []; // Dependencies that expire before deadline
    let anySatisfied = false; // Track if any dependencies were satisfied

    // Load all dependencies (tasks can have aup to max-task-dependencies)
    let rows = await this.db.fns.get_multiple_tasks(JSON.stringify(task.dependencies), null, null);
    let requiredTasks = rows.map(row => Task.fromDb(row));
    let loadedTasksIds = requiredTasks.map(task => task.taskId);
    const missing = task.dependencies.filter(taskId => !loadedTasksIds.includes(taskId));

    if (missing.length === 0) {
      await Promise.all(requiredTasks.map(async (requiredTask) => {
        // Check if requiredTask expires before the deadline
        if (task.deadline.getTime() > requiredTask.expires.getTime()) {
          return expiring.push(requiredTask.taskId);
        }

        // Check if requiredTask is satisfied
        let state = requiredTask.state();
        if (state === 'completed' || task.requires === 'all-resolved' &&
            (state === 'exception' || state === 'failed')) {
          await this.db.fns.satisfy_task_dependency(task.taskId, requiredTask.taskId);
          // Track that we've deleted something, now we must check if any are left
          // afterward (using isBlocked)
          anySatisfied = true;
        }
      }));
    }
    // free up memory
    rows = null;
    requiredTasks = null;
    loadedTasksIds = null;

    // If we found some missing dependencies we're done, createTask should
    // clearly return an error
    if (missing.length > 0 || expiring.length > 0) {
      // Construct explanatory error message
      let msg = '';
      if (missing.length > 0) {
        msg += '`task.dependencies` references non-existing tasks: \n';
        msg += missing.map(taskId => {
          return ' * ' + taskId;
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

      // First remove task
      await this.db.fns.remove_task(task.taskId);

      // Then remove dependencies, because removing these makes it
      // easier to trigger the task. So we remove them after removing the task.
      await this.db.fns.remove_task_dependencies(task.taskId, JSON.stringify(task.dependencies));

      return {
        message: msg,
        details: {
          dependencies: task.dependencies,
          missingTaskDependencies: missing,
          expiringTaskDependencies: expiring,
        },
      };
    }

    // If the task isn't blocked (dependencies resolved), or it has no
    // dependencies we ensure that the first run is pending (if not already).
    if (anySatisfied && !(await this.isBlocked(task.taskId)) ||
        task.dependencies.length === 0) {

      task.updateStatusWith(
        await this.db.fns.schedule_task(task.taskId, 'scheduled'));
    }

    // We don't have any error
    return null;
  }

  /** Track resolution of a task, scheduling any dependent tasks */
  async resolveTask(taskId, taskGroupId, schedulerId, resolution) {
    assert(resolution === 'completed' || resolution === 'failed' ||
         resolution === 'exception',
    'resolution must be completed, failed or exception');

    // iterate through the dependencies in such a way that deletion of
    // a task does not cause a dependency to be skipped (which might occur
    // if using offset and limit)
    let tasksAfter = null;
    while (true) {
      const deps = await this.db.fns.get_dependent_tasks(taskId, null, tasksAfter, 100, null);

      for (let dep of deps) {
        tasksAfter = dep.dependent_task_id;

        if (resolution !== 'completed') {
          // If the resolution wasn't 'completed', we can only remove mark this
          // dependency as satisfied if the 'require' relation is
          // 'all-resolved'.
          if (dep.requires !== 'all-resolved') {
            continue;
          }
        }

        // Remove the requirement that is blocking
        await this.db.fns.satisfy_task_dependency(dep.dependent_task_id, taskId);

        if (!(await this.isBlocked(dep.dependent_task_id))) {
          await this.scheduleTask(dep.dependent_task_id);
        }
      }

      // when we've seen all of the dependencies, we're done
      if (deps.length === 0) {
        break;
      }
    }

    await this.updateTaskGroupActiveSet(taskId, taskGroupId, schedulerId);
  }

  /** Returns true, if some task requirement is blocking the task */
  async isBlocked(taskId) {
    const [{ is_task_blocked }] = await this.db.fns.is_task_blocked(taskId);
    return is_task_blocked;
  }

  /**
   * Remove a resolved task from the working set and check for task-group resolution
   *
   * If a task-group has no active tasks left in it, we are free to send a message
   * that the group is "resolved" for the time being.
   */
  async updateTaskGroupActiveSet(taskId, taskGroupId, schedulerId) {
    await this.db.fns.mark_task_ever_resolved(taskId);

    const [{ is_task_group_active }] = await this.db.fns.is_task_group_active(taskGroupId);

    if (!is_task_group_active) {
      const [{ sealed, expires }] = await this.db.fns.get_task_group2(taskGroupId);

      await this.publisher.taskGroupResolved({
        taskGroupId,
        schedulerId,
        expires: expires?.toJSON() || undefined,
        sealed: sealed?.toJSON() || undefined,
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
      task = await Task.get(this.db, taskOrTaskId);

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
    if (!task.updateStatusWith(await this.db.fns.schedule_task(task.taskId, 'scheduled'))) {
      // if schedule_task failed, then we've raced with someone to schedule this task; return
      // the updated task status.
      task = await Task.get(this.db, task.taskId);
      return task.status();
    }

    // Construct status structure
    let status = task.status();

    // Put message into pending queue, and publish message to pulse,
    // if the initial run is pending
    if (task.runs && task.runs[0].state === 'pending') {
      await Promise.all([
        this.queueService.putPendingMessage(task, 0),
        this.publisher.taskPending({
          status: status,
          runId: 0,
          task: { tags: task.tags || {} },
        }, task.routes),
      ]);
      this.monitor.log.taskPending({ taskId: task.taskId, runId: 0 });
    }

    return status;
  }
}

// Export DependencyTracker
export default DependencyTracker;
