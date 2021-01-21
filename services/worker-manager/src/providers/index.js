const { NullProvider } = require('./null');
const { TestingProvider } = require('./testing');
const { StaticProvider } = require('./static');
const { GoogleProvider } = require('./google');
const { AwsProvider } = require('./aws');
const { AzureProvider } = require('./azure');

const PROVIDER_TYPES = {
  null: NullProvider,
  testing: TestingProvider,
  static: StaticProvider,
  google: GoogleProvider,
  aws: AwsProvider,
  azure: AzureProvider,
};

// sleep for 60 between trying the `setup` method of providers
let SETUP_RETRY_INTERVAL = 60 * 1000;

// for tests..
const setSetupRetryInterval = i => SETUP_RETRY_INTERVAL = i;

/**
 * Load all of the providers in the configuration, including loading
 * their providerType implementation as required.  This class also tracks
 * which providers have successfully been set up, and handles failed setup
 * properly by never returning a failed provider.
 */
class Providers {
  async setup({ cfg, monitor, notify, db, estimator, Worker, WorkerPoolError, validator }) {
    this.monitor = monitor;
    this._providers = {};

    if (cfg.providers['null-provider']) {
      throw new Error('Explicit configuration of the null-provider providerId is not allowed');
    }

    const nullEntry = ['null-provider', { providerType: 'null' }];
    for (const [providerId, providerConfig] of Object.entries(cfg.providers).concat([nullEntry])) {
      if (providerConfig.providerType === 'null' && providerId !== 'null-provider') {
        throw new Error('Only the `null-provider` providerId may have providerType `null`');
      }
      const Provider = PROVIDER_TYPES[providerConfig.providerType];
      if (!Provider) {
        throw new Error(`Unknown providerType ${providerConfig.providerType} selected for providerId ${providerId}.`);
      }
      const provider = new Provider({
        providerId,
        notify,
        db,
        monitor: monitor.childMonitor(`provider.${providerId}`),
        rootUrl: cfg.taskcluster.rootUrl,
        estimator,
        Worker,
        WorkerPoolError,
        validator,
        providerConfig,
      });
      this._providers[providerId] = provider;

      // await the first attempt at setting up the provider
      await this.setupProvider(providerId, provider);
    }

    // return self to make this easier to use in a loader component
    return this;
  }

  // Try *once* to set up the provider, returning either with success or
  // having marked the provider as `provider.setupFailed = true` with a
  // retry scheduled.
  async setupProvider(providerId, provider) {
    try {
      await provider.setup();
      provider.setupFailed = false;
    } catch (err) {
      // if an error occurs in setup, mark the provider as having failed its
      // setup, report the error, and then try again after a delay.  Note that
      // this (async) function returns before that retry completes.
      provider.setupFailed = true;
      this.monitor.reportError(err, { providerId });
      setTimeout(() => this.setupProvider(providerId, provider), SETUP_RETRY_INTERVAL);
    }
  }

  /**
   * Get a list of valid providerIds (including those whose setup has failed)
   */
  validProviderIds() {
    return Object.keys(this._providers);
  }

  /**
   * Run the async callback for all providers that have been setup successfully
   */
  forAll(cb) {
    return Promise.all(
      Object.values(this._providers)
        .filter(p => !p.setupFailed)
        .map(cb));
  }

  /**
   * Return true if this providerId is defined (regardless of whether its setup failed)
   */
  has(providerId) {
    return Boolean(this._providers[providerId]);
  }

  /**
   * Get the named provider instance.  If no such provider exists, this returns null;
   * if the provider is not yet set up, it returns an object with `{setupFailed: true}`
   * It is up to the caller to verify this property.
   */
  get(providerId) {
    const p = this._providers[providerId];
    if (p && p.setupFailed) {
      // If setup failed, we do not return the provider, but just an empty object.  This
      // avoids mistakes where the caller does not check for failed setup.
      return { setupFailed: true };
    }
    return p;
  }
}

module.exports = { Providers, setSetupRetryInterval };
