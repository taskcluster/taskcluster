import { FakeCloud } from './fake.js';
import { strict as assert } from 'assert';

import azureApi from '../../src/providers/azure/azure-api.js';

import slugid from 'slugid';

/**
 * Fake the Azure SDK.
 *
 * Instances have `computeClient`, `networkClient` properties
 * that allow access to fakes for those interfaces.
 */
export class FakeAzure extends FakeCloud {
  constructor() {
    super();
  }

  _patch() {
    this.sinon.stub(azureApi, 'ComputeManagementClient').callsFake((creds, subId) => {
      assert.equal(creds?.getToken()?.token, 'fake-credentials');
      return this.computeClient;
    });
    this.sinon.stub(azureApi, 'NetworkManagementClient').callsFake((creds, subId) => {
      assert.equal(creds?.getToken()?.token, 'fake-credentials');
      return this.networkClient;
    });
    this.sinon.stub(azureApi, 'ClientSecretCredential').returns({
      getToken() {
        return { token: 'fake-credentials', expiresOnTimestamp: Date.now() + 3600 * 1000 };
      },
    });

    this._reset();
  }

  _reset() {
    // managers indexed by resourceType
    this._managers = {
      vm: new VMResourceManager(this, 'vm', 'azure-vm.yml'),
      // (no schema for disks as provider does not create them directly)
      disk: new ResourceManager(this, 'disk'),
      nic: new ResourceManager(this, 'nic', 'azure-nic.yml'),
      ip: new ResourceManager(this, 'ip', 'azure-ip.yml'),
    };

    this.computeClient = {
      virtualMachines: this._managers['vm'],
      disks: this._managers['disk'],
    };
    this.networkClient = {
      networkInterfaces: this._managers['nic'],
      publicIPAddresses: this._managers['ip'],
    };
  }
}

const makeError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

class ResourceRequest {
  constructor(kind, resourceType, resourceGroupName, name, parameters) {
    this.kind = kind;
    this.resourceType = resourceType;
    this.resourceGroupName = resourceGroupName;
    this.name = name;
    this.parameters = parameters;
    this.status = 'InProgress';
    this.error = undefined;
  }
}

class ResourceManager {
  constructor(fake, resourceType, createSchema) {
    this.fake = fake;
    this.resourceType = resourceType;
    this.createSchema = createSchema;

    this._requests = new Map();
    this._resources = new Map();
  }

  // SDK Methods

  async get(resourceGroupName, name) {
    const key = `${resourceGroupName}/${name}`;
    if (this._resources.has(key)) {
      return this._resources.get(key);
    }
    throw makeError(`${this.resourceType} ${key} not found`, 404);
  }

  async beginCreateOrUpdateAndWait(resourceGroupName, name, parameters) {
    const key = `${resourceGroupName}/${name}`;
    if (this._resources.has(key)) {
      throw makeError(`${this.resourceType} ${key} already exists`, 409);
    }
    if (this._requests.has(key)) {
      throw makeError(`${this.resourceType} ${key} is already requested`, 409);
    }
    if (this.createSchema) {
      this.fake.validate(parameters, this.createSchema);
    }
    const req = new ResourceRequest('create', this.resourceType, resourceGroupName, name, parameters);
    this._requests.set(key, req);
    return req;
  }

  async beginDeleteAndWait(resourceGroupName, name) {
    const key = `${resourceGroupName}/${name}`;
    if (!this._resources.has(key)) {
      throw makeError(`${this.resourceType} ${key} does not exist`, 404);
    }
    if (this._requests.has(key)) {
      throw makeError(`${this.resourceType} ${key} is already requested`, 409);
    }
    const res = this._resources.get(key);
    res.provisioningState = 'Deleting';
    const req = new ResourceRequest('delete', this.resourceType, resourceGroupName, name, {});
    this._requests.set(key, req);
    return req;
  }

  // Subclass Overrides

  /**
   * Convert a resource request into the corresponding resource
   */
  _requestToResource(request) {
    return {
      // Azure generates random IDs, but ours are based on the name for ease of debugging
      id: `id/${request.name}`,
      provisioningState: 'Succeeded',
    };
  }

  // Fake Manipulation

  /**
   * Make a new, fake resource directly
   */
  makeFakeResource(resourceGroupName, name, overrides = {}) {
    const key = `${resourceGroupName}/${name}`;
    assert(!this._resources.has(key));
    const res = { id: `id/${name}`, provisioningState: 'Succeeded', ...overrides };
    this._resources.set(key, res);
    return res;
  }

  /**
   * Get a fake resource, or undefined if nonexistent
   */
  getFakeResource(resourceGroupName, name) {
    const key = `${resourceGroupName}/${name}`;
    return this._resources.get(key);
  }

  /**
   * Modify a fake resource
   */
  modifyFakeResource(resourceGroupName, name, modifier) {
    const key = `${resourceGroupName}/${name}`;
    const res = this._resources.get(key);
    assert(res);
    modifier(res);
  }

  /**
   * Get a pending request's parameters
   */
  getFakeRequestParameters(resourceGroupName, name) {
    const key = `${resourceGroupName}/${name}`;
    const req = this._requests.get(key);
    assert(req, `no such request for ${key}`);
    return req.parameters;
  }

  /**
   * Make the given long-running request finish
   */
  fakeFinishRequest(resourceGroupName, name) {
    const key = `${resourceGroupName}/${name}`;
    const req = this._requests.get(key);
    assert(req, `no such request for ${key}`);
    if (req.kind === 'create') {
      const res = this._requestToResource(req);
      this._resources.set(key, res);
    } else {
      this._resources.delete(key);
    }
    req.status = 'Complete'; // made up, no docs for what this would be
  }

  /**
   * Make the given long-running request fail
   */
  fakeFailRequest(resourceGroupName, name, errorMessage) {
    const key = `${resourceGroupName}/${name}`;
    const req = this._requests.get(key);
    assert(req, `no such request for ${key}`);
    req.status = 'Failed'; // made up, no docs for what this would be
    req.error = errorMessage;
  }
}

export class VMResourceManager extends ResourceManager {
  constructor(fake, resourceType, createSchema) {
    super(fake, resourceType, createSchema);
    this._instanceViews = new Map();
  }

  // SDK Methods

  async instanceView(resourceGroupName, name) {
    const key = `${resourceGroupName}/${name}`;
    if (this._instanceViews.has(key)) {
      return this._instanceViews.get(key);
    }
    throw makeError(`${this.resourceType} ${key} instance view not found`, 404);
  }

  // Subclass Overrides

  _requestToResource(request) {
    let dataDisks = [];
    for (let i = 0; i < request.parameters.storageProfile.dataDisks.length; i++) {
      dataDisks.push({ name: slugid.nice() });
    }
    return {
      id: `id/${request.name}`,
      provisioningState: 'Succeeded',
      // Azure generates uuids for vmIds, but we'll use something recognizable
      vmId: `vmid/${request.name}`,
      storageProfile: {
        osDisk: {
          name: slugid.nice(),
        },
        dataDisks,
      },
    };
  }

  // Fake Manipulation

  /**
   * Set the instanceView value for a given VM
   */
  setFakeInstanceView(resourceGroupName, name, instanceView) {
    const key = `${resourceGroupName}/${name}`;
    if (instanceView) {
      this._instanceViews.set(key, instanceView);
    } else {
      this._instanceViews.delete(key);
    }
  }
}
