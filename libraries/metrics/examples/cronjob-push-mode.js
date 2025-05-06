import { MetricsManager } from '../src/index.js';

// IIFE to allow top-level await
(async () => {
  // Register service-specific metrics
  MetricsManager.register({
    name: 'job_processed_items',
    type: 'counter',
    description: 'Number of items processed by the job',
    serviceName: 'cron-job',
  });

  MetricsManager.register({
    name: 'job_processing_duration_seconds', // Clarified unit in name
    type: 'histogram',
    description: 'Duration of job processing in seconds',
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
    serviceName: 'cron-job',
  });

  MetricsManager.register({
    name: 'job_errors_total', // Clarified total
    type: 'counter',
    description: 'Total number of errors encountered during job execution',
    serviceName: 'cron-job',
  });

  // Setup metrics for this job with push gateway config
  // MetricsManager.setup() is now async.
  // It will call metrics.startPushing internally.
  // If push options are provided and no interval is set (or interval is 0),
  // startPushing will attempt an initial push.
  const metrics = await MetricsManager.setup({
    serviceName: 'cron-job',
    push: {
      gateway: process.env.PUSHGATEWAY_URL || 'http://localhost:9091', // Use env var or default
      jobName: 'data-cleanup-job', // More specific jobName
      groupings: {
        instance: process.env.HOSTNAME || 'cron-instance-unknown',
        environment: process.env.NODE_ENV || 'development',
      },
      // No interval means it's configured for manual/single pushes via metrics.push()
      // and metrics.startPushing() (called by setup) will do one initial push.
    },
  });

  // Simulate a job function
  async function runJob() {
    console.log('Starting job execution...');

    const endTimer = metrics.startTimer('job_processing_duration_seconds');

    try {
      const itemsToProcess = 50 + Math.floor(Math.random() * 50); // Randomize item count a bit
      console.log(`Processing ${itemsToProcess} items...`);

      let processedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < itemsToProcess; i++) {
        if (Math.random() < 0.05) { // 5% chance of error
          errorCount++;
          metrics.increment('job_errors_total', 1);
          console.log(`Simulated error processing item ${i + 1}`);
          // Decide if error is critical or if job continues
          // For this example, we continue
          await new Promise(resolve => setTimeout(resolve, Math.random() * 20)); // Simulate error handling time
          continue;
        }

        processedCount++;
        metrics.increment('job_processed_items', 1);
        if (i % 10 === 0) {
          console.log(`Processed ${processedCount} items so far...`);
        }
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10)); // Simulate work
      }

      console.log(`Job completed. Processed ${processedCount} items with ${errorCount} errors.`);

    } catch (err) {
      metrics.increment('job_errors_total', 1);
      console.error('Job failed with unexpected error:', err);
      // Rethrow or handle as appropriate for the cron job's error management
      throw err;
    } finally {
      const duration = endTimer(); // Record duration
      console.log(`Job duration: ${duration.toFixed(3)}s`);

      // The metrics.push function is configured by setup() if push options are provided.
      // This final push sends all accumulated metrics.
      if (metrics.push) {
        try {
          console.log('Pushing final metrics to gateway...');
          await metrics.push();
          console.log('Metrics pushed successfully.');
        } catch (pushError) {
          console.error('Failed to push metrics to gateway:', pushError.message);
          // Depending on cron job requirements, this failure might be critical
        }
      } else {
        console.warn('Metrics push was not configured. Skipping final push.');
      }
    }
  }

  // Run the job
  try {
    await runJob();
    console.log('Job execution finished successfully.');
    // For a real cron job, you might not need process.exit if the script naturally ends.
    // process.exit(0);
  } catch (error) {
    console.error('Job execution failed with unhandled error:', error);
    // process.exit(1);
  }

})().catch(topLevelError => {
  console.error('Failed to initialize or run cron job example:', topLevelError);
  process.exit(1);
});
