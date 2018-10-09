'use strict';

// note that Regions is no longer a supported concept, this needs to be
// represented as part of the provider id.  In otherwords the us-west-2 region
// would become "ec2_us-west-2".  This will need to be provided by the provider
// as a provider specific satisfier, since we still wish to be able to use it.

const ErrorCodes = Object.freeze({
  // InvalidWorkerConfiguration represents an error caused by a generally
  // malformed worker configuration
  InvalidWorkerConfiguration: 'InvalidWorkerConfiguration',

  // MethodUnimplemented represents a call to a method which is not implemented
  MethodUnimplemented: 'MethodUnimplemented',

  // InvalidSatisfiers represents an error caused by passing an invalid object
  // for the satisfiers object needed
  InvalidSatisfiers: 'InvalidSatisfiers',

  // MissingSatisfiers represents an error caused by passing an object for the
  // satisfiers object missing a required satisfier key
  MissingSatisfiers: 'MissingSatisfiers',

  // InvalidProvider represents an error caused by specifying a providerId which
  // does not exist in the providers map
  InvalidProvider: 'InvalidProvider',

  // MissingProvider represents an error caused by specifying a providerId which
  // does not exist in the providers map
  MissingProvider: 'MissingProvider',
});

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
      this._throw(ErrorCodes.InvalidWorkerConfiguration, 'id must be provided');
    }
    this.id = id;
  }
 
  /**
   * Standardize exceptions thrown
   */
  _throw(code, msg) {
    let err = new Error(msg);
    err.workerConfigurationId = this.id || '<unknown-worker-configuration-id>';
    err.code = code;
    throw err;
  }

  /**
   * Evaluate a worker configuration
   */
  evaluate(satisfiers) {
    this._throw(ErrorCodes.MethodUnimplemented, 'WorkerConfiguration.evaluate()');
  }

  /**
   * Must return an iterator of strings
   */
  workerTypes() {
    this._throw(ErrorCodes.MethodUnimplemented, 'WorkerConfiguration.workerTypes()');
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
      this._throw(ErrorCodes.InvalidWorkerConfiguration, 'workerTypes must be array');
    }

    for (let workerType of workerTypes) {
      if (typeof workerType !== 'string') {
        this._throw(ErrorCodes.InvalidWorkerConfiguration, 'workerTypes entries must be strings');
      }
    }

    this._workerTypes = workerTypes;
    if (typeof configuration !== 'object') {
        this._throw(ErrorCodes.InvalidWorkerConfiguration, 'configuration must be object');
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
        this._throw(ErrorCodes.InvalidWorkerConfiguration, 'worker type name must be string');
      }
      this.workerType = workerType;

      if (typeof biddingStrategyId !== 'string') {
        this._throw(ErrorCodes.InvalidWorkerConfiguration, 'bidding strategy id must be string');
      }
      this.biddingStrategyId = biddingStrategyId;

      if (!Array.isArray(providerIds)) {
        this._throw(ErrorCodes.InvalidWorkerConfiguration, 'provider ids must be array');
      }
      for (let providerId of providerIds) {
        if (typeof providerId !== 'string') {
          this._throw(ErrorCodes.InvalidWorkerConfiguration, 'provider id must be string');
        }
      }
      this.provider = providerIds;
    }

    this.workerTypeConfigurations = workerTypeConfigurations;

    if (typeof rules !== 'object') {
      this._throw(ErrorCodes.InvalidWorkerConfiguration, 'rules must be provided');
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
      this._throw(ErrorCodes.InvalidSatisfiers, 'invalid satisfiers provided'); 
    }
    let providerId = satisfiers.providerId;
    let provider = providers.get(providerId);

    if (!provider) {
      this._throw(ErrorCodes.MissingProvider, 'unknown provider, id: ' + providerId);
    }

    let requiredSatisfiers = this.rules.requiredSatisfiers().sort();
    let providedSatisfiers = provider.providedSatisfiers();
    if (!Array.isArray(providedSatisfiers)) {
      this._throw(ErrorCode.InvalidProvider, 'provider did not provide satifiers');
    }
    providedSatisfiers = providedSatisfiers.concat(Object.keys(satisfiers));
    providedSatisfiers.sort();

    for (let requiredSatisfier of requiredSatisfiers) {
      if (!providedSatisfiers.includes(requiredSatisfier)) {
        this._throw(ErrorCodes.MissingSatisfier, 'missing satisfier');
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

  function assertArrayOfStrings(array) {
    if (!Array.isArray(array)) {
      throw new Error('Expected array');
    }
    for (let i of array) {
      if (typeof i !== 'string') {
        throw new Error('Expected array of strings');
      }
    }
  } 

  if (typeof config === 'string') {
    config = JSON.parse(config);
  }

  if (typeof config !== 'object') {
    throw new Error('Worker Configuration format invalid');
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
      throw new Error('if provided, default bidding strategy must be string');
    }

    if (defaultProviderIds) {
      assertArrayOfStrings(defaultProviderIds);
    }

    if (!Array.isArray(workerTypeConfigurations)) {
      throw new Error('worker types must be an array');
    }

    return new ProvisionedWorkerConfiguration({
      id,
      workerTypeConfigurations: workerTypeConfigurations.map(workerType => {
        const workerTypeConfiguration = new Map();

        if (typeof workerType === 'string') {
          workerTypeConfiguration.set('workerType', workerType);
        } else {
          if (typeof workerType.workerType !== 'string') {
            throw new Error('worker type name must be string');
          }
          workerTypeConfiguration.set('workerType', workerType.workerType);
        }

        let providerIds = workerType.providerIds;
        if (!providerIds && !defaultProviderIds) {
          throw new Error('acceptable provider ids and default provider ids not provided');
        }
        if (providerIds) {
          assertArrayOfStrings(providerIds);
          workerTypeConfiguration.set('providerIds', providerIds);
        } else {
          workerTypeConfiguration.set('providerIds', defaultProviderIds);
        }


        let biddingStrategyId = workerType.biddingStrategyId;
        if (!biddingStrategyId && !defaultBiddingStrategyId) {
          throw new Error('acceptable bidding strategy id default and bidding strategy not provided');
        }
        if (biddingStrategyId) {
          if (typeof biddingStrategyId !== 'string') {
            throw new Error('if provided, biddingStrategyId must be a string');
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
    assertArrayOfStrings(config.workerTypes);
    return new StaticWorkerConfiguration(config);
  } else {
    throw new Error('Worker Configuration is invalid');
  }

}

module.exports = {
  WorkerConfiguration,
  ProvisionedWorkerConfiguration,
  StaticWorkerConfiguration,
  buildWorkerConfiguration,
};
