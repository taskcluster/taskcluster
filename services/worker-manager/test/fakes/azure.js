import { FakeCloud } from './fake.js';
import { strict as assert } from 'assert';

import azureApi from '../../src/providers/azure/azure-api.js';

import slugid from 'slugid';

/**
 * Fake the Azure SDK.
 *
 * Instances have `computeClient`, `networkClient`, and `restClient` properties
 * that allow access to fakes for those interfaces.
 */
export class FakeAzure extends FakeCloud {
  constructor() {
    super();
  }

  _patch() {
    this.sinon.stub(azureApi, 'AzureServiceClient').callsFake((creds) => {
      assert.equal(creds?.getToken()?.token, 'fake-credentials');
      return this.restClient;
    });
    this.sinon.stub(azureApi, 'ComputeManagementClient').callsFake((creds, subId) => {
      assert.equal(creds?.getToken()?.token, 'fake-credentials');
      return this.computeClient;
    });
    this.sinon.stub(azureApi, 'NetworkManagementClient').callsFake((creds, subId) => {
      assert.equal(creds?.getToken()?.token, 'fake-credentials');
      return this.networkClient;
    });
    this.sinon.stub(azureApi, 'ResourceManagementClient').callsFake((creds, subId) => {
      assert.equal(creds?.getToken()?.token, 'fake-credentials');
      return this.resourcesClient;
    });
    this.sinon.stub(azureApi, 'DeploymentsClient').callsFake((creds, subId) => {
      assert.equal(creds?.getToken()?.token, 'fake-credentials');
      return this.deploymentsClient;
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
      deployment: new DeploymentManager(this, 'deployment'),
      resourceGroup: new ResourceGroupManager(this),
    };

    this.computeClient = {
      virtualMachines: this._managers['vm'],
      disks: this._managers['disk'],
    };
    this.networkClient = {
      networkInterfaces: this._managers['nic'],
      publicIPAddresses: this._managers['ip'],
    };
    this.resourcesClient = {
      resourceGroups: this._managers['resourceGroup'],
    };
    this.deploymentsClient = this._managers['deployment'];

    this.restClient = new FakeRestClient(this);
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

  getOperationState() {
    return {
      status: this.status,
      config: {
        operationLocation: `op/${this.resourceType}/${this.resourceGroupName}/${this.name}`,
      },
    };
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

  async beginCreateOrUpdate(resourceGroupName, name, parameters) {
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

  async beginDelete(resourceGroupName, name) {
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

export class DeploymentManager extends ResourceManager {
  constructor(fake, resourceType) {
    super(fake, resourceType);
    this._deployments = new Map();
    this._deploymentOperations = new Map();
    this._conflictOnDelete = new Set();

    this.deployments = {
      get: async (rg, name) => this.get(rg, name),
      beginCreateOrUpdate: async (rg, name, params) => this.beginCreateOrUpdate(rg, name, params),
      beginDelete: async (rg, name) => this.beginDelete(rg, name),
      deploymentExists: (rg, name) => this.deploymentExists(rg, name),
      setFakeDeploymentState: (rg, name, state, error) => this.setFakeDeploymentState(rg, name, state, error),
      setFakeDeploymentOutputs: (rg, name, outputs) => this.setFakeDeploymentOutputs(rg, name, outputs),
      setFakeShouldConflictOnDelete: (rg, name, shouldConflict) =>
        this.setFakeShouldConflictOnDelete(rg, name, shouldConflict),
    };

    this.deploymentOperations = {
      list: (rg, name) => this.listDeploymentOperations(rg, name),
      setFakeDeploymentOperations: (rg, name, operations) => this.setFakeDeploymentOperations(rg, name, operations),
    };
  }

  async get(resourceGroupName, name) {
    const key = `${resourceGroupName}/${name}`;
    if (this._deployments.has(key)) {
      return this._deployments.get(key);
    }
    throw makeError(`${this.resourceType} ${key} not found`, 404);
  }

  async beginCreateOrUpdate(resourceGroupName, name, parameters) {
    const key = `${resourceGroupName}/${name}`;

    const deployment = {
      id: `id/${name}`,
      name,
      properties: {
        provisioningState: 'Succeeded',
        outputs: {
          vmName: {
            type: 'String',
            value: parameters.parameters?.vmName?.value || 'fake-vm-name',
          },
        },
      },
    };

    this._deployments.set(key, deployment);

    const req = new ResourceRequest('create', this.resourceType, resourceGroupName, name, parameters);
    req.status = 'Complete';
    this._requests.set(key, req);

    return req;
  }

  async beginDelete(resourceGroupName, name) {
    const key = `${resourceGroupName}/${name}`;

    // Check if we should simulate a conflict
    if (this._conflictOnDelete.has(key)) {
      this._conflictOnDelete.delete(key); // Clear flag after first attempt
      throw makeError(
        `Unable to edit or replace deployment '${name}': previous deployment is still active`,
        409,
      );
    }

    this._deployments.delete(key);

    const req = new ResourceRequest('delete', this.resourceType, resourceGroupName, name, {});
    req.status = 'Complete';
    this._requests.set(key, req);

    return req;
  }

  /**
   * Set deployment provisioning state for testing
   */
  setFakeDeploymentState(resourceGroupName, name, state, error = null) {
    const key = `${resourceGroupName}/${name}`;
    const deployment = this._deployments.get(key);
    if (deployment) {
      deployment.properties.provisioningState = state;
      if (error) {
        deployment.properties.error = { message: error };
      }
    }
  }

  /**
   * Set deployment outputs for testing
   */
  setFakeDeploymentOutputs(resourceGroupName, name, outputs) {
    const key = `${resourceGroupName}/${name}`;
    const deployment = this._deployments.get(key);
    if (deployment) {
      deployment.properties.outputs = outputs;
    }
  }

  /**
   * Set whether deletion should fail with a 409 conflict for testing
   */
  setFakeShouldConflictOnDelete(resourceGroupName, name, shouldConflict) {
    const key = `${resourceGroupName}/${name}`;
    if (shouldConflict) {
      this._conflictOnDelete.add(key);
    } else {
      this._conflictOnDelete.delete(key);
    }
  }

  /**
   * Check if deployment exists
   */
  deploymentExists(resourceGroupName, name) {
    const key = `${resourceGroupName}/${name}`;
    return this._deployments.has(key);
  }

  /**
   * List deployment operations (returns async iterator)
   */
  async *listDeploymentOperations(resourceGroupName, name) {
    const key = `${resourceGroupName}/${name}`;
    const operations = this._deploymentOperations.get(key) || [];
    for (const operation of operations) {
      yield operation;
    }
  }

  /**
   * Set fake deployment operations for testing
   * @param {string} resourceGroupName
   * @param {string} name
   * @param {Array} operations - Array of operation objects
   */
  setFakeDeploymentOperations(resourceGroupName, name, operations) {
    const key = `${resourceGroupName}/${name}`;
    this._deploymentOperations.set(key, operations);
  }
}

export class ResourceGroupManager {
  constructor(fake) {
    this.fake = fake;
    this._resourceGroups = new Map();
  }

  /**
   * Check if a resource group exists
   * Returns Azure SDK response format with body property
   */
  async checkExistence(resourceGroupName) {
    return { body: this._resourceGroups.has(resourceGroupName) };
  }

  /**
   * Create or update a resource group
   */
  async createOrUpdate(resourceGroupName, parameters) {
    const rg = {
      id: `/subscriptions/fake-sub/resourceGroups/${resourceGroupName}`,
      name: resourceGroupName,
      location: parameters.location,
      properties: {
        provisioningState: 'Succeeded',
      },
    };
    this._resourceGroups.set(resourceGroupName, rg);
    return rg;
  }

  /**
   * Get a resource group
   */
  async get(resourceGroupName) {
    if (this._resourceGroups.has(resourceGroupName)) {
      return this._resourceGroups.get(resourceGroupName);
    }
    throw makeError(`Resource group ${resourceGroupName} not found`, 404);
  }

  /**
   * Create a fake resource group directly (for testing)
   */
  makeFakeResourceGroup(resourceGroupName, location = 'westus') {
    const rg = {
      id: `/subscriptions/fake-sub/resourceGroups/${resourceGroupName}`,
      name: resourceGroupName,
      location,
      properties: {
        provisioningState: 'Succeeded',
      },
    };
    this._resourceGroups.set(resourceGroupName, rg);
    return rg;
  }

  /**
   * Check if a resource group exists in the fake (for testing)
   */
  hasFakeResourceGroup(resourceGroupName) {
    return this._resourceGroups.has(resourceGroupName);
  }
}

export class FakeRestClient {
  constructor(fake) {
    this.fake = fake;
  }

  async sendLongRunningRequest(req) {
    // op is op/<resourceType>/<resourceGroupName>/<resource>
    const op = req.url.split('/');
    assert.equal(op[0], 'op');
    const manager = this.fake._managers[op[1]];
    const key = `${op[2]}/${op[3]}`;
    const resourceReq = manager._requests.get(key);
    if (!resourceReq) {
      return { status: 404 };
    }

    return {
      status: 200,
      parsedBody: {
        status: resourceReq.status,
        error: resourceReq.error,
      },
    };
  }
}
