'use strict';

const errors = require('./errors');
const {Ruleset} = require('./rules')

/**
 * A WorkerConfiguration in the simplist terms maps an identifier
 * to a list of worker type names and rules which can be used to generate
 * data for providers, bidding strategies and metadata services.
 *
 * The term "worker type" is an unfortunate name which represents various
 * things to various people.  In this service, it refers to a logical pool
 * of machines which can each execute a task with equivalent results.
 *
 * The arguments passed into the constructor are:
 *
 *   - id: string identifier for a worker configuration
 *   - workerTypeConfigurations: a configuration for each worker type
 *   - rules: a Ruleset
 *
 * Worker Type Configurations:
 *
 * This is a list of objects in the shape of {workerType} or {workerType,
 * biddingStrategyId, providerIds}.  The difference between these two shapes
 * reflects whether or not this worker configuration is provisioned or not.
 * There is no special handling for this case, rather that when either a bidding
 * strategy or provider asks for worker types relevant to it, it would not be included.
 *
 * This means that workers which are provisioned or not can exist within the same
 * "worker type" pool.
 *
 * In order to ensure that the difference between these two is clear, any
 * worker type which has either a provisonerIds list or biddingStrategyId must
 * have both.  The bidding strategy id is a string and provider ids is a list of 
 * strings.  Each of these ids referes to the id of the respective type of object.
 *
 * Rules:
 *
 * The rules provided will be evaluated by bidding strategies, providers and
 * metadata endpoints.  Each evaluator of these rules will pass in the relevant
 * satifiers for itself.  All of the rules must evaluate to an object in the
 * shape {workerType: String, provider: {}, biddingStrategy: {},
 * documentation: {}, schemas: {}}.  Each of these sections is relevant to an
 * area of the worker manager.  The bidding strategy data must be valid to the
 * bidding strategy selected for that worker type, likewise for the provider
 * data.  The API for documentation and schema will define what is required
 * there.  All validation of these values must be handled by the consuming
 * system.
 *
 * By having a single set of rules, we allow worker configuration maintainers
 * the ability to be very expressive.  A bidding strategy can evaluate the rules
 * without a providerId to get the global worker type maximum capacity, then
 * again for each provider to get the maximum for the specific capacity.
 */
class WorkerConfiguration {
  constructor({id, workerTypeConfigurations, rules}) {
    if (typeof id !== 'string') {
      this._throw(errors.InvalidWorkerConfiguration, 'id must be provided');
    }
    this.id = id;

    // We want to track the worker types we've already seen to ensure we have
    // exactly one worker type
    let workerTypes = [];

    // We want to validate the worker type configurations
    for (let workerTypeConfiguration of workerTypeConfigurations) {
      let workerType = workerTypeConfiguration.get('workerType');

      if (workerTypes.includes(workerType)) {
        this._throw(errors.InvalidWorkerConfiguration, `${id} contains duplicate worker type ${workerType}`);
      }
      workerTypes.push(workerType);

      let providerIds = workerTypeConfiguration.get('providerIds');
      let biddingStrategyId = workerTypeConfiguration.get('biddingStrategyId');

      if (typeof workerType !== 'string') {
        this._throw(errors.InvalidWorkerConfiguration, 'worker type name must be string');
      }

      if (biddingStrategyId && providerIds) {
        if (typeof biddingStrategyId !== 'string') {
          this._throw(errors.InvalidWorkerConfiguration, 'bidding strategy id must be string');
        }

        if (!Array.isArray(providerIds)) {
          this._throw(errors.InvalidWorkerConfiguration, 'provider ids must be array');
        }
        for (let providerId of providerIds) {
          if (typeof providerId !== 'string') {
            this._throw(errors.InvalidWorkerConfiguration, 'provider id must be string');
          }
        }
      } else if (!biddingStrategyId && !providerIds) {
      } else {
        this._throw(errors.InvalidWorkerConfiguration,
          'must provide both bidding strategy id and provide ids or neither' );
      }
    }
    this.workerTypeConfigurations = workerTypeConfigurations;

    if (typeof rules !== 'object') {
      this._throw(errors.InvalidWorkerConfiguration, 'rules must be provided');
    }
    this.rules = rules;
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
   * Evaluate a ruleset for this worker type.  When a satisfier required for a
   * rule in the ruleset is not present, the rule is skipped.  This allows the
   * bidding strategy to evaluate rules without worrying about provider
   * provided satisfiers.
   *
   * At a minimum, all evaluations must provide at least a workerType satisfier
   */
  evaluate(satisfiers) {
    if (typeof satisfiers !== 'object') {
      this._throw(errors.InvalidSatisfiers, 'invalid satisfiers provided'); 
    }

    if (typeof satisfiers.workerType !== 'string') {
      this._throw(errors.InvalidSatisfiers, 'workerType is required satisfier'); 
    }

    let outcome = this.rules.evaluate(satisfiers);

    outcome.workerType = satisfiers.workerType;


    // Let's make sure defaults are set
    for (let x of ['provider', 'biddingStrategy', 'documentation', 'schema']) {
      const k = x + 'Data';
      outcome[k] = outcome[k] || {};
    }

    // Then let's make sure that no more keys than we expect exist
    if (Object.keys(outcome).length !== 5) {
      this._throw(errors.InvalidWorkerConfiguration, `too many root rule values keys`);
    }

    return outcome;
  }

  workerTypes() {
    return this.workerTypeConfigurations.map(x => x.get('workerType'));
  }

  workerTypesForProviderId(providerId) {
    return this.workerTypeConfigurations
      .filter(x => x.get('providerIds').includes(providerId))
      .map(x => x.get('workerType'));
  }

  workerTypesForBiddingStategy(biddingStrategyId) {
    return this.workerTypeConfigurations
      .filter(x => x.get('biddingStrategyId') === biddingStrategyId)
      .map(x => x.get('workerType'));
  }
}


/**
 * This function understands how to convert the serialised format of a worker
 * configuration and create either a Provisioned or Static WorkerConfiguration
 * class.  Note that the serialised format and in-memory format are different.
 * The config can either be a string or a JSON.parse'd copy of that string
 */
function buildWorkerConfiguration(config) {
  if (typeof config === 'string') {
    config = JSON.parse(config);
  }

  let {
    id,
    workerTypes: workerTypeConfigurations,
    rules,
    providerIds: defaultProviderIds,
    biddingStrategyId: defaultBiddingStrategyId,
  } = config;

  // TODO: that in the future, the idea thing here would be to have a list of
  // errors, and make it so that each item here is try/catch'd and then the
  // errors from building the worker configuration were then thrown as a single
  // Error with a reasons property.  This will make the UI much nicer to work
  // with

  const err = (msg) => {
    throw new errors.InvalidWorkerConfiguration(`${id}: ${msg}`);
  }

  const assertArrayOfStrings = (array, msg) => {
    if (!Array.isArray(array)) {
      err(msg);
    }
    for (let i of array) {
      if (typeof i !== 'string') {
        err(msg);
      }
    }
  } 

  if (defaultBiddingStrategyId && typeof defaultBiddingStrategyId !== 'string') {
    err('default bidding strategy id must be string');
  }

  if (defaultProviderIds) {
    assertArrayOfStrings(defaultProviderIds);
  }

  if (!Array.isArray(workerTypeConfigurations)) {
    err('worker type configurations must be array');
  }

  return new WorkerConfiguration({
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

      let providerIds = workerType.providerIds || defaultProviderIds;
      let biddingStrategyId = workerType.biddingStrategyId || defaultBiddingStrategyId;

      // We want to handle provisioned worker configuration specially
      if (providerIds && biddingStrategyId) {
        assertArrayOfStrings(providerIds, 'provider ids must be array of strings');
        if (typeof biddingStrategyId !== 'string') {
          err('bidding strategy id must be string');
        }
        workerTypeConfiguration.set('providerIds', providerIds);
        workerTypeConfiguration.set('biddingStrategyId', biddingStrategyId);
      } else if (providerIds || biddingStrategyId) {
        err(`Specifying providerIds or biddingStrategyId implies a requirement on the other`);
      }
      return workerTypeConfiguration;
    }),
    rules: new Ruleset({rules}),
  });
}

module.exports = {
  WorkerConfiguration,
  buildWorkerConfiguration,
};
