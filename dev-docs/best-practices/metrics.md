# Prometheus Metrics

Taskcluster services expose Prometheus metrics via `@taskcluster/lib-monitor`.

See `libraries/monitor/README.md` for the full API reference.

## Registering a Metric

Register metrics at module load time with `MonitorManager.registerMetric()`.
The first argument is the **id** you will use in code; the second is a config object.

```js
import { MonitorManager } from '@taskcluster/lib-monitor';

MonitorManager.registerMetric('failedTasks', {
  name: 'queue_failed_tasks',        // Prometheus metric name
  type: 'counter',                    // counter | gauge | histogram | summary
  title: 'Counter for failed tasks',
  description: 'Counter for failed tasks',
  labels: {
    provisionerId: 'ProvisionerID part of the taskQueueId',
    workerType: 'WorkerType part of the taskQueueId',
  },
  registers: ['default'],             // which registry (default: ['default'])
});
```

Options:

| Option | Required | Notes |
|---|---|---|
| `name` | yes | Follow Prometheus naming conventions (`snake_case`, include unit). |
| `type` | yes | `counter`, `gauge`, `histogram`, or `summary`. |
| `description` | yes | Human-readable description of what is measured. |
| `labels` | no | Object of `{ labelName: 'docs' }`. Keep cardinality low. |
| `buckets` | no | Array of bucket boundaries (histogram only). |
| `percentiles` | no | Array of percentiles (summary only). |
| `registers` | no | Array of registry names. Defaults to `['default']`. Use a separate registry when metrics must be published from a different process (see the `totals` registry in queue). |
| `serviceName` | no | Restricts the metric to a single service in generated docs. |


## Using Metrics in Service Code

After `MonitorManager.setup()`, every registered id is available as a method on `monitor.metric`:

```js
monitor.metric.failedTasks(1, { provisionerId, workerType, reasonResolved });
```

The first argument is a numeric value; the second (optional) is an object of label values.

| Type | What the call does |
|---|---|
| `counter` | Increments by the given value. |
| `gauge` | Sets the gauge to the given value. |
| `histogram` | Records an observation in the matching bucket. |
| `summary` | Records an observation for percentile calculation. |

## Exposing Metrics from a Process

Each long-lived process that records metrics **must** call `exposeMetrics()` to start the HTTP server on port 9100.
Without this call, Prometheus has nothing to scrape.

```js
// In a loader component, after the service is wired up:
monitor.exposeMetrics('default');
```

The string argument selects which **registry** to expose.
If your process uses a non-default registry (e.g. `totals`), pass that name instead:

```js
const childMonitor = monitor.childMonitor('queue-metrics');
childMonitor.exposeMetrics('totals');
```

A single process should call `exposeMetrics()` only once.
See `services/queue/src/main.js` for both patterns: the `server` loader exposes `'default'` and the `queue-metrics` loader exposes `'totals'`.

## Marking a Process in `procs.yml`

For the Helm chart to wire up Prometheus scraping, the process entry in `procs.yml` needs `metrics: true`:

```yaml
web:
  type: web
  command: node services/queue/src/main.js server
  metrics: true

workerMetrics:
  type: background
  subType: 'iterate'
  command: node services/queue/src/main.js queue-metrics
  metrics: true
```

This flag causes the deployment tooling to:

1. Expose container port 9100 in the pod spec.
2. Add `prometheus.io/scrape: "true"` and `prometheus.io/port: "9100"` annotations.
3. Inject the `PROMETHEUS_CONFIG` environment variable.

Cron jobs (`type: cron`) do not need `metrics: true` because they are short-lived.
If a cron job needs to push metrics, configure a PushGateway instead (see `prometheusConfig.push` below).

## Configuring `prometheusConfig`

The `PROMETHEUS_CONFIG` env var is JSON, mapped through `config.yml` as `monitoring.prometheusConfig` and spread into `MonitorManager.setup()`:

```yaml
# config.yml
monitoring:
  prometheusConfig: !env:json:optional PROMETHEUS_CONFIG
```

```js
// main.js loader
monitor: {
  requires: ['process', 'profile', 'cfg'],
  setup: ({ process, profile, cfg }) => MonitorManager.setup({
    serviceName: 'queue',
    processName: process,
    verify: profile !== 'production',
    ...cfg.monitoring,
  }),
},
```

The config shape:

```json
{
  "prefix": "fxci",
  "server": {
    "port": 9100,
    "ip": "0.0.0.0"
  },
  "push": {
    "gateway": "http://pushgateway:9091",
    "jobName": "my-job",
    "groupings": { "environment": "production" }
  }
}
```

| Field | Purpose |
|---|---|
| `prefix` | Optional string prepended to all metric names (e.g. `fxci_queue_failed_tasks`). |
| `server.port` | Port for the `/metrics` and `/health` endpoints (default 9100). |
| `server.ip` | Bind address (default `127.0.0.1`; use `0.0.0.0` in containers). |
| `push.gateway` | PushGateway URL, for short-lived processes only. |
| `push.jobName` | Job name sent to the gateway (defaults to `serviceName`). |
| `push.groupings` | Extra labels attached to pushed metrics. |

See `libraries/monitor/README.md` for full details on all options.

## Checklist for Adding a New Metric

1. Register the metric in the appropriate `src/monitor.js` (or the module that records it).
2. Record values with `monitor.metric.<id>(value, labels)` in the service code.
3. Ensure the process calls `monitor.exposeMetrics('<registry>')` in its loader.
4. Set `metrics: true` on the process in `procs.yml`.
5. Grep for existing metrics with the same name to avoid duplicates.
6. Run `yarn generate` to update generated docs, then `yarn test` in the service directory.
