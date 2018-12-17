'use strict';

const {WMObject, errors} = require('./base');

/**
 * A Worker represents a view of a managed instance at a specific time.  In
 * the worker-manager context, this means the smallest unit of computing
 * resources which are uniquely identifiable in a cloud provider or hosting
 * environment.  In EC2-Spot this is an EC2 instance.  In a data center, this
 * would be a VM or Physical machine.  This distinction is made so that the
 * worker manager can present APIs which do automated management of the
 * underlying resources.
 */
class Worker extends WMObject {
  constructor({id, group, workerType, state, capacity, workerConfigurationId, providerData}) {
    super({id});

    if (typeof group !== 'string') {
      this._throw(errors.InvalidWorker, 'worker group must be string');
    }
    this.group = group;
    
    if (typeof workerConfigurationId !== 'string') {
      this._throw(errors.InvalidWorker, 'worker workerConfigurationId must be string');
    }
    this.workerConfigurationId = workerConfigurationId;
    
    if (typeof workerType !== 'workerType') {
      this._throw(errors.InvalidWorker, 'workerType must be string');
    }
    this.workerType = workerType;

    if (typeof state !== 'string') {
      this._throw(errors.InvalidWorker, 'state must be symbol');
    }
    this.state = state;

    if (typeof capacity !== 'number') {
      this._throw(errors.InvalidWorker, 'capacity must be number');
    }
    this.this.capacity = capacity;

    if (typeof providerData !== 'object') {
      this._throw(errors.InvalidWorker, 'providerData must be an object');
    }
    this.this.providerData = providerData;
  }
}
