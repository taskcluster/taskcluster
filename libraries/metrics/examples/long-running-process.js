import { MetricsManager } from '../src/index.js';

// IIFE to allow top-level await for setup
(async () => {
  // Register service-specific metrics
  MetricsManager.register({
    name: 'active_tasks',
    type: 'gauge',
    description: 'Number of currently active tasks',
    serviceName: 'background-worker',
  });

  MetricsManager.register({
    name: 'processed_tasks_total',
    type: 'counter',
    description: 'Total number of processed tasks',
    labelNames: ['status'], // e.g., success, failure
    serviceName: 'background-worker',
  });

  MetricsManager.register({
    name: 'task_processing_duration_seconds', // Clarified unit
    type: 'histogram',
    description: 'Duration of task processing in seconds',
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
    serviceName: 'background-worker',
  });

  let metrics;
  try {
    // Setup metrics with both a server and push gateway
    // MetricsManager.setup() is now async.
    // It will call metrics.startHttpServer() and await metrics.startPushing() internally.
    metrics = await MetricsManager.setup({
      serviceName: 'background-worker',
      prefix: 'worker', // Example prefix
      server: {
        port: 9101, // Different port to avoid conflict if other examples run
        ip: '0.0.0.0',
      },
      push: {
        gateway: process.env.PUSHGATEWAY_URL || 'http://localhost:9091',
        interval: 15000, // Push every 15 seconds for faster feedback in example
        jobName: 'long_running_worker_process',
        groupings: {
          instance: process.env.HOSTNAME || 'worker-instance-unknown',
          environment: process.env.NODE_ENV || 'development',
        },
      },
    });
  } catch (error) {
    console.error('Failed to initialize metrics:', error);
    process.exit(1);
  }

  // Simulated task queue
  const taskQueue = [];
  let currentActiveTasks = 0;

  function addRandomTasks() {
    const count = Math.floor(Math.random() * 3) + 1; // 1-3 tasks
    for (let i = 0; i < count; i++) {
      taskQueue.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        duration: Math.floor(Math.random() * 800) + 50, // 50-850ms
      });
    }
    console.log(`Added ${count} tasks. Queue size: ${taskQueue.length}, Active: ${currentActiveTasks}`);
  }

  async function processTaskFromQueue() {
    if (taskQueue.length === 0) {
      return false; // No task processed
    }

    currentActiveTasks++;
    metrics.set('active_tasks', currentActiveTasks); // No labels for this metric

    const task = taskQueue.shift();
    console.log(`Processing task ${task.id} (duration: ${task.duration}ms). Active: ${currentActiveTasks}`);
    const endTimer = metrics.startTimer('task_processing_duration_seconds');
    let status = 'failure'; // Default to failure

    try {
      await new Promise(resolve => setTimeout(resolve, task.duration));
      status = 'success';
      metrics.increment('processed_tasks_total', 1, { status });
      console.log(`Task ${task.id} completed successfully.`);
    } catch (err) {
      metrics.increment('processed_tasks_total', 1, { status });
      console.error(`Task ${task.id} failed:`, err);
    } finally {
      endTimer({ status }); // Pass status label to timer
      currentActiveTasks--;
      metrics.set('active_tasks', currentActiveTasks);
      console.log(`Finished task ${task.id}. Queue size: ${taskQueue.length}, Active: ${currentActiveTasks}`);
    }
    return true; // Task was processed
  }

  function startWorkerLogic() {
    console.log('Background worker process started.');
    console.log('Metrics server and push (if configured) are active.');

    setInterval(addRandomTasks, 5000); // Add tasks every 5 seconds

    // Concurrently process tasks from the queue
    const MAX_CONCURRENT_TASKS = 3;
    setInterval(async () => {
      const numToProcess = Math.min(MAX_CONCURRENT_TASKS - currentActiveTasks, taskQueue.length);
      if (numToProcess <= 0 && taskQueue.length > 0) {
        // console.log('Max concurrency reached or no tasks to process now.');
      }
      if (numToProcess > 0) {
        console.log(`Attempting to process up to ${numToProcess} tasks concurrently.`);
      }

      const processingPromises = [];
      for (let i = 0; i < numToProcess; i++) {
        if (taskQueue.length > 0) { // Double check queue has items before starting a process task
          processingPromises.push(processTaskFromQueue());
        }
      }
      if (processingPromises.length > 0) {
        await Promise.all(processingPromises);
      }
    }, 1000); // Check to process tasks every second
  }

  // Handle graceful shutdown for SIGINT (Ctrl-C) and SIGTERM
  async function shutdown(signal) {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);

    // Stop adding/processing new tasks (clear intervals)
    // For a real app, you'd clear all intervals and ensure no new work is picked up.
    console.log('Stopping worker intervals (simulated). In a real app, clear your intervals here.');

    // Allow some time for in-flight tasks to complete if possible
    // This is a simple example; a real app would have more sophisticated draining logic.
    console.log('Waiting a moment for active tasks to potentially finish...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (metrics) {
      console.log('Terminating metrics (includes final push if configured and interval was set)...');
      await metrics.terminate(); // This handles server shutdown and final push for interval-based pushes.
    }
    console.log('Shutdown complete.');
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start the main worker logic after metrics are set up
  startWorkerLogic();

})().catch(topLevelError => {
  console.error('Failed to start long-running process example:', topLevelError);
  process.exit(1);
});
