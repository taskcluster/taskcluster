import { Worker } from './data.js';
import { Provider } from './providers/provider.js';

/** @typedef {import('./providers/provider.js').ManagedResource} ManagedResource */

// Resources younger than this may still be mid-creation (cloud call done, DB row
// not yet written; NIC created but VM not yet attached), so they are not judged.
const DEFAULT_GRACE_PERIOD_MS = 60 * 60 * 1000;

/**
 * Report-only check for dangling cloud resources: resources tagged as managed by
 * taskcluster that worker-manager no longer tracks.  It takes no action, it only
 * logs a `danglingResource` message per finding and a `danglingResourcesSummary`
 * per provider.
 *
 * Reasons:
 *  - untracked: an instance with no worker row
 *  - stopped-but-alive: an instance whose worker row is STOPPED
 *  - unattached: a disk, NIC or IP not attached to anything
 *
 * Resources tagged with another deployment's root URL are only counted.
 * Resources without a root-url tag (created before it existed) are checked and
 * flagged as `legacy`, since they may belong to another deployment.
 */
export class ResourceChecker {
  /**
   * @param {{
   *   providers: import('./providers/index.js').Providers,
   *   db: import('@taskcluster/lib-postgres').Database,
   *   monitor: import('@taskcluster/lib-monitor').Monitor,
   *   gracePeriodMs?: number,
   * }} opts
   */
  constructor({ providers, db, monitor, gracePeriodMs = DEFAULT_GRACE_PERIOD_MS }) {
    this.providers = providers;
    this.db = db;
    this.monitor = monitor;
    this.gracePeriodMs = gracePeriodMs;
  }

  async check() {
    await this.providers.forAll((/** @type {Provider} */ provider) => {
      if (provider.listManagedResources === Provider.prototype.listManagedResources) {
        return;
      }
      return this.#checkProvider(provider);
    });
  }

  /** @param {Provider} provider */
  async #checkProvider(provider) {
    const { providerId, providerType } = provider;
    const summary = {
      providerId,
      providerType,
      listed: 0,
      byType: /** @type {Record<string, number>} */ ({}),
      foreign: 0,
      legacy: 0,
      tooYoung: 0,
      unknownAge: 0,
      dangling: /** @type {Record<string, number>} */ ({ untracked: 0, 'stopped-but-alive': 0, unattached: 0 }),
      listErrors: 0,
      lookupErrors: 0,
    };

    /** @type {ManagedResource[]} */
    let resources;
    try {
      resources = await provider.listManagedResources();
    } catch (err) {
      summary.listErrors = 1;
      this.monitor.reportError(err, { providerId });
      this.monitor.log.danglingResourcesSummary(summary);
      return;
    }

    const ownRootUrlTag = provider.rootUrlTagValue();
    const now = Date.now();

    for (const resource of resources) {
      summary.listed++;
      summary.byType[resource.resourceType] = (summary.byType[resource.resourceType] || 0) + 1;

      const legacy = !resource.rootUrlTag;
      if (!legacy && resource.rootUrlTag !== ownRootUrlTag) {
        summary.foreign++;
        continue;
      }
      if (legacy) {
        summary.legacy++;
      }
      if (!resource.createdAt) {
        summary.unknownAge++;
        continue;
      }
      if (now - resource.createdAt.getTime() < this.gracePeriodMs) {
        summary.tooYoung++;
        continue;
      }

      let reason = null;
      let worker;
      if (resource.resourceType === 'instance') {
        if (resource.worker) {
          try {
            worker = await Worker.get(this.db, resource.worker);
          } catch (err) {
            summary.lookupErrors++;
            this.monitor.reportError(err, { providerId, resourceId: resource.resourceId });
            continue;
          }
        }
        if (!worker) {
          reason = 'untracked';
        } else if (worker.state === Worker.states.STOPPED) {
          reason = 'stopped-but-alive';
        }
      } else if (!resource.attached) {
        reason = 'unattached';
      }

      if (!reason) {
        continue;
      }
      summary.dangling[reason]++;
      this.monitor.log.danglingResource({
        providerId,
        providerType,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        name: resource.name,
        location: resource.location,
        reason,
        legacy,
        workerPoolId: resource.worker?.workerPoolId ?? resource.workerPoolId,
        workerGroup: resource.worker?.workerGroup ?? null,
        workerId: resource.worker?.workerId ?? null,
        workerState: worker?.state ?? null,
        createdAt: resource.createdAt.toJSON(),
        ageHours: Math.floor((now - resource.createdAt.getTime()) / 3600000),
      });
    }

    this.monitor.log.danglingResourcesSummary(summary);
  }
}
