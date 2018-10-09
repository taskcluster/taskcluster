'use strict';

const errors = require('./errors');
const {Ruleset} = require('./rules')

/**
 * This class is the base WorkerConfiguration class.  It represents an
 * in-memory WorkerConfiguration and is not meant to be involved directly in
 * the serialization or deserialization of WorkerConfigurations.
 * WorkerConfigurations are meant to be immutable objects.  When making changes
 * to a worker configuration, the in-memory copies of the worker types should
 * be discarded and rebuilt.
 */
class WorkerConfiguration {
  constructor({id}) {
    if (typeof id !== 'string') {
      this._throw(errors.InvalidWorkerConfiguration, 'id must be provided');
    }
    this.id = id;
  }
 
  /**
   * Standardize exceptions thrown
   */
  _throw(code, msg) {
    throw new code(msg, {
      'class': this.constructor.name, 
      id: this.id,
    });
  }

  /**
   * Evaluate a worker configuration
   */
  evaluate(satisfiers) {
    this._throw(errors.MethodUnimplemented, 'WorkerConfiguration.evaluate()');
  }

  /**
   * Must return an iterator of strings
   */
  workerTypes() {
    this._throw(errors.MethodUnimplemented, 'WorkerConfiguration.workerTypes()');
  }
}

/**
 * This class represents a static worker configuration in memory.  This class 
 * does not support any automatic provisioning, instead having a constant
 * configuration.  The configuration must be equal to the result of evaluating
 * a successful WorkerConfiguration.evaluate().
 */
class StaticWorkerConfiguration extends WorkerConfiguration {
  constructor({id, workerTypes, configuration}) {
    super({id});

    if (!Array.isArray(workerTypes)) {
      this._throw(errors.InvalidWorkerConfiguration, 'workerTypes must be array');
    }

    for (let workerType of workerTypes) {
      if (typeof workerType !== 'string') {
        this._throw(errors.InvalidWorkerConfiguration, 'workerTypes entries must be strings');
      }
    }

    this._workerTypes = workerTypes;
    if (typeof configuration !== 'object') {
        this._throw(errors.InvalidWorkerConfiguration, 'configuration must be object');
    }
    this.configuration = configuration;
  }

  /**
   * Evaluate a worker configuration
   */
  evaluate(satisfiers) {
    return this.configuration;
  }

  workerTypes() {
    return this._workerTypes.values();
  }
}

/**
 * This class represents a provisioned worker configuration in memory. *
 *
 * The constructor parameters are:
 *  - id: identifier for this worker configuration
 *  - workerTypes: list of objects {workerType, biddingStrategy, providers}
 *  - rules: A Ruleset to use with this worker type
 *  - biddingStrategies: reference to a Map which maps bidding strategy
 *    identifier to the bidding strategy implmenentation
 *  - providers: reference to a Map which maps provider identifier to the
 *    provider implementation
 */
class ProvisionedWorkerConfiguration extends WorkerConfiguration {
  constructor({id, workerTypeConfigurations, rules}) {
    super({id});

    for (let workerTypeConfiguration of workerTypeConfigurations) {
      let workerType = workerTypeConfiguration.get('workerType');
      let providerIds = workerTypeConfiguration.get('providerIds');
      let biddingStrategyId = workerTypeConfiguration.get('biddingStrategyId');

      if (typeof workerType !== 'string') {
        this._throw(errors.InvalidWorkerConfiguration, 'worker type name must be string');
      }
      this.workerType = workerType;

      if (typeof biddingStrategyId !== 'string') {
        this._throw(errors.InvalidWorkerConfiguration, 'bidding strategy id must be string');
      }
      this.biddingStrategyId = biddingStrategyId;

      if (!Array.isArray(providerIds)) {
        this._throw(errors.InvalidWorkerConfiguration, 'provider ids must be array');
      }
      for (let providerId of providerIds) {
        if (typeof providerId !== 'string') {
          this._throw(errors.InvalidWorkerConfiguration, 'provider id must be string');
        }
      }
      this.provider = providerIds;
    }

    this.workerTypeConfigurations = workerTypeConfigurations;

    if (typeof rules !== 'object') {
      this._throw(errors.InvalidWorkerConfiguration, 'rules must be provided');
    }
    this.rules = rules;
  }

  /**
   * Evaluate a WorkerConfiguration's rules based on a set of satisfiers and a
   * map of providers.  The satisfiers must contain a provisionerId which is an
   * entry in the providers map
   */
  evaluate({providers, satisfiers}) {
    if (typeof satisfiers !== 'object') {
      this._throw(errors.InvalidSatisfiers, 'invalid satisfiers provided'); 
    }
    let providerId = satisfiers.providerId;
    let provider = providers.get(providerId);

    if (!provider) {
      this._throw(errors.InvalidProvider, `unknown provider: ${providerId}`);
    }

    let requiredSatisfiers = this.rules.requiredSatisfiers().sort();
    let providedSatisfiers = provider.providedSatisfiers();
    if (!Array.isArray(providedSatisfiers)) {
      this._throw(ErrorCode.InvalidProvider, `${providerId} gave invalid satisfiers`);
    }
    providedSatisfiers = providedSatisfiers.concat(Object.keys(satisfiers));
    providedSatisfiers.sort();

    for (let requiredSatisfier of requiredSatisfiers) {
      if (!providedSatisfiers.includes(requiredSatisfier)) {
        this._throw(errors.InvalidSatisfiers, `required satisfier ${requiredSatisfier} not provided`);
      }
    }

    return this.rules.evaluate(satisfiers);
  }

  workerTypes() {
    return this.workerTypeConfigurations.keys();
  }
}


/**
 * This function understands how to convert the serialised format of a worker
 * configuration and create either a Provisioned or Static WorkerConfiguration
 * class.  Note that the serialised format and in-memory format are different.
 * The config can either be a string or a JSON.parse'd copy
 */

function buildWorkerConfiguration(config) {

  // TODO: that in the future, the idea thing here would be to have a list of
  // errors, and make it so that each item here is try/catch'd and then the
  // errors from building the worker configuration were then thrown as a single
  // Error with a reasons property.  This will make the UI much nicer to work
  // with

  function err(msg) {
    throw new errors.InvalidWorkerConfiguration(msg);
  }

  function assertArrayOfStrings(array, msg) {
    if (!Array.isArray(array)) {
      err(msg);
    }
    for (let i of array) {
      if (typeof i !== 'string') {
        err(msg);
      }
    }
  } 

  if (typeof config === 'string') {
    config = JSON.parse(config);
  }

  if (typeof config !== 'object') {
    err();
  }

  if (config.rules && config.configuration) {
    throw new Error('Worker Configuration must be static or provisioned');
  } else if (config.rules) {
    let {
      id,
      workerTypes: workerTypeConfigurations,
      rules,
      providerIds: defaultProviderIds,
      biddingStrategyId: defaultBiddingStrategyId,
    } = config;

    if (defaultBiddingStrategyId && typeof defaultBiddingStrategyId !== 'string') {
      err('default bidding strategy id must be string');
    }

    if (defaultProviderIds) {
      assertArrayOfStrings(defaultProviderIds);
    }

    if (!Array.isArray(workerTypeConfigurations)) {
      err('worker types must be array');
    }

    return new ProvisionedWorkerConfiguration({
      id,
      workerTypeConfigurations: workerTypeConfigurations.map(workerType => {
        const workerTypeConfiguration = new Map();

        if (typeof workerType === 'string') {
          workerTypeConfiguration.set('workerType', workerType);
        } else {
          if (typeof workerType.workerType !== 'string') {
            err('worker type name be string');
          }
          workerTypeConfiguration.set('workerType', workerType.workerType);
        }

        let providerIds = workerType.providerIds;
        if (!providerIds && !defaultProviderIds) {
          err('no provider ids specified');
        }
        if (providerIds) {
          assertArrayOfStrings(providerIds, 'provider ids must be array of strings');
          workerTypeConfiguration.set('providerIds', providerIds);
        } else {
          workerTypeConfiguration.set('providerIds', defaultProviderIds);
        }


        let biddingStrategyId = workerType.biddingStrategyId;
        if (!biddingStrategyId && !defaultBiddingStrategyId) {
          err('no bidding strategy id specified');
        }
        if (biddingStrategyId) {
          if (typeof biddingStrategyId !== 'string') {
            err('bidding strategy id must be string');
          }
          workerTypeConfiguration.set('biddingStrategyId', biddingStrategyId);
        } else {
          workerTypeConfiguration.set('biddingStrategyId', defaultBiddingStrategyId);
        }

        return workerTypeConfiguration;
      }),
      rules: new Ruleset({rules}),
    });
  } else if (config.configuration) {
    assertArrayOfStrings(config.workerTypes, 'worker types must be an array of strings');
    return new StaticWorkerConfiguration(config);
  } else {
    err();
  }

}

module.exports = {
  WorkerConfiguration,
  ProvisionedWorkerConfiguration,
  StaticWorkerConfiguration,
  buildWorkerConfiguration,
};
