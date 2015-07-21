import xml2js from 'xml2js';
import Debug from 'debug';
import request from 'superagent-promise';
import Promise from 'promise';
import assert from 'assert';

const MAX_MESSAGES_PER_REQUEST = 32;
const parseXmlString = Promise.denodeify(xml2js.parseString.bind(xml2js));

let debug = Debug('taskcluster-docker-worker:queueService');

async function sleep(duration) {
  return new Promise(accept => setTimeout(accept, duration));
}

async function makeRequest(method, url, retries, retryInterval, payload) {
    method = method.toUpperCase();
    while (--retries >= 0) {
      try {
        debug(`requesting: ${url}`);
        let req = request(method, url);

        if(payload) req.send(payload);

        let response = await req.buffer().end();

        if (!response.ok) {
          let error = new Error(response.text);
          error.statusCode = response.status;
          throw error;
        }

        return response;
      }
      catch (e) {
        debug(`Error requesting ${url}. Error: ${e} status code: ${e.statusCode} Retries left: ${retries}`);
        if (retries === 0) {
          throw new Error(`Could not complete request. status code: ${e.statusCode} Error: ${e}`);
        }
      }
      await sleep(retryInterval);
    }
}

/**
 * Create a task queue that will poll for queues that could contain messages and
 * claim work based on the available capacity of the worker.
 *
 * config:
 * {
 *   workerId:          // Worker ID for this worker
 *   workerType:        // Worker type for this worker
 *   workerGroup:       // Worker group for this worker
 *   provisionerID:     // ID of the provisioner used for this worker
 *   queue:             // Queue instance as provided by taskcluster-client
 *   log:               // Logger instance
 *   stats:             // Stats instance
 *   task: {
 *     dequeueCount:    // Times a task should be dequeued before permanently
 *                      // removing from the queue.
 *   }
 *   taskQueue: {
 *     expiration:            // Time in milliseconds used to determine if the
 *                            // queues should be refreshed
 *   }
 * }
 *
 */
export default class TaskQueue {
  constructor(config) {
    assert(config.workerId, 'Worker ID is required');
    assert(config.workerType, 'Worker type is required');
    assert(config.workerGroup, 'Worker group is required');
    assert(config.provisionerId, 'Provisioner ID is required');
    assert(config.queue, 'Instance of taskcluster queue is required');
    assert(config.log, 'Logger is required');
    assert(config.stats, 'Stats instance is required');
    assert(config.task.dequeueCount, 'Dequeue count is required');
    assert(config.taskQueue.expiration, 'Queue expiration time in miliseconds is required');
    this.queues = null;
    this.queue = config.queue;
    this.workerType = config.workerType;
    this.provisionerId = config.provisionerId;
    this.client = config.queue;
    this.log = config.log;
    this.stats = config.stats;
    this.dequeueCount = config.task.dequeueCount;
    this.queueExpiration = config.taskQueue.expiration;
    this.maxRetries = config.taskQueue.maxRetries || 5;
    this.requestRetryInterval = config.taskQueue.requestRetryInterval || 2 * 1000;
    this.claimConfig = {
      workerId: config.workerId,
      workerGroup: config.workerGroup
    };
  }

  /**
   * Attemts to claim the task.  Tasks that cannot be claimed because of 4xx
   * errors will be removed from the queue because the are either not pending or
   * claimed by another worker.
   *
   * @param {Object} task - Contains taskId and runId
   *
   * @returns {Object} claim
   */
  async claimTask(task) {
    let claim;
    try {
      claim = await this.queue.claimTask(task.taskId, task.runId, this.claimConfig)

      this.log('claim task', {
        taskId: task.taskId,
        runId: task.runId
      });
    }
    catch (e) {
      // Server error or 401 Authentication errors should stop trying to claim tasks
      // and not delete the message from the queue
      if (!(400 <= e.statusCode && e.statusCode < 500) || e.statusCode === 401) {
        throw e;
      }

      this.log('claim task error', {
        taskId: task.taskId,
        runId: task.runId,
        err: e,
        stack: e.stack
      });
    }

    // Delete message from the queue if it's been claimed or request
    // returned 4xx (except 401)
    await this.deleteTaskFromQueue(task);
    return claim;
  }

  /**
   * Queue will make an attempt to claim as much work as capacity allows.  Queues
   * will be tried in the order of priority until either the queues have no more messages
   * or the number of claimed tasks equals available capacity
   *
   * @param {Number} capacity - Number of tasks the worker is able to work on
   *
   * @param {Array} claims
   */
  async claimWork(capacity) {
    debug(`polling for ${capacity} tasks`);
    let claims = [];

    let queues = (await this.getQueues()).queues;
    for(let queue of queues) {
      if (claims.length >= capacity) break;
      // Keep polling queue until enough tasks were claimed or there are no more
      // tasks in the queue
      // Move onto the next queue if more tasks are needed but current queue is exhausted
      // This ensures that as many tasks as possible are consumed from the highest priority
      // queue
      while(claims.length < capacity) {
        let tasksNeeded = capacity - claims.length;
        let tasks = await this.getTasksFromQueue(queue, tasksNeeded);
        if (!tasks.length) break;
        let newClaims = await Promise.all(tasks.map(async (task) => {
          return await this.claimTask(task);
        }));

        // Filter out entries that are not actual claims because of an error
        newClaims = newClaims.filter((claim) => { return claim; });
        claims = claims.concat(newClaims);
      }
    }
    debug(`Claimed ${claims.length} tasks`);
    return claims;
  }

  /**
   * Return the queues that messages can be retrieved from.  Refresh the list
   * of queues if the queue expiration is within the configured expiration window.
   *
   * @returns {Array} queues - List of queues that contains signed urls for retrieving
   *                           and deleting messages
   *
   */
  async getQueues() {
    // If queue url expiration is within `expiration` then refresh the queues
    // to reduce risk of using an expired url
    let expiration = Date.now() + this.queueExpiration;
    if (!this.queues || (expiration > new Date(this.queues.expires).getTime())) {
      this.queues = await this.client.pollTaskUrls(this.provisionerId, this.workerType);
    }
    return this.queues;
  }

  /**
   * Retrieves a particular number of tasks from a queue.
   *
   * @param {Object} queue - Queue object that contains signed urls
   * @param {Number} numberOfTasks - The number of tasks that should be retrieved
   */
  async getTasksFromQueue(queue, numberOfTasks) {
    let maxMessages = Math.min(numberOfTasks, MAX_MESSAGES_PER_REQUEST);
    let tasks = [];
    let uri = `${queue.signedPollUrl}&numofmessages=${maxMessages}`;

    let response;
    try {
      response = await makeRequest(
        'GET', uri, this.maxRetries, this.requestRetryInterval
      );
    }
    catch (e) {
      this.log('[alert operator] queue request error', {
        message: 'Could not retrieve tasks from the queue',
        err: e,
        stack: e.stack
      });
      return [];
    }

    let xml = await parseXmlString(response.text);

    if(!xml.QueueMessagesList) return [];

    for(let message of xml.QueueMessagesList.QueueMessage) {
      let payload = new Buffer(message.MessageText[0], 'base64').toString();
      payload = JSON.parse(payload);

      // Construct a delete URL for each message based on the delete URL returned
      // from polling for queue urls. Each URL is unique to each message in the queue
      // based on message ID and pop Receipt.  This URL will be called when a
      // message needs to be removed from the queue.
      payload.deleteUri = queue.signedDeleteUrl
       .replace('{{messageId}}', encodeURIComponent(message.MessageId[0]))
       .replace('{{popReceipt}}', encodeURIComponent(message.PopReceipt[0]));

      // If the message has been dequeued a lot, chances are the message is bad and should
      // be removed from the queue and not claimed.
      let dequeueCount = parseInt(message.DequeueCount[0]);
      if (dequeueCount >= this.dequeueCount) {
        this.log('[alert operator] task error', {
          taskId: payload.taskId,
          runId: payload.runId,
          message: `Message has been dequeued ${dequeueCount} times.  Deleting from queue.`
        });
        await this.deleteTaskFromQueue(payload);
        continue;
      }

      tasks.push(payload);
    }
    return tasks;
  }

  /**
   * Deletes a specific task from the queue
   *
   * @param {Object} task - Task to remove from the queue
   */
  async deleteTaskFromQueue(task) {
    try {
      await makeRequest(
        'DELETE', task.deleteUri, this.maxRetries, this.requestRetryInterval
      );
    }
    catch (e) {
      // Deleting from the queue should not cause a task not to be handled. Log
      // error and continue
      this.log('[alert operator] queue request error', {
        taskId: task.taskId,
        runId: task.runId,
        message: 'Could not delete the task from the queue.',
        err: e,
        stack: e.stack
      });
    }
  }
}
