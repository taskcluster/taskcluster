/**
 * This defines a fairly brittle and scripted
 * set of interactions that the azure provider makes
 * with the azure apis in order to test out our side of things
 * within the provider. This can either grow to be more flexible for
 * more testing later or we can come up with some other plan.
 */

const sinon = require("sinon");

// Note: we set some stubs on `this` so the tests can check
// whether they have been called
class FakeAzure {
  constructor() {}

  error(code) {
    const err = new Error(code);
    err.statusCode = code;
    return err;
  }

  network() {
    const createOrUpdateNICStub = sinon.stub();
    createOrUpdateNICStub.returns({
      "id": "/subscriptions/subscription-id/resourceGroups/group-name/providers/Microsoft.Network/networkInterfaces/test-nic",
      "location": "westus",
      "name": "test-nic",
    });

    this.deleteNICStub = sinon.stub();
    this.deleteNICStub.returns({});

    this.getNICStub = sinon.stub();
    // exists, should delete
    this.getNICStub.returns({provisioningState: 'Failed'});

    const createOrUpdateIPStub = sinon.stub();
    createOrUpdateIPStub.returns({
      "id": "/subscriptions/subscription-id/resourceGroups/group-name/providers/Microsoft.Network/publicIPAddresses/test-ip",
      "location": "westus",
      "name": "test-ip",
    });

    this.deleteIPStub = sinon.stub();
    this.deleteIPStub.returns({});

    this.getIPStub = sinon.stub();
    this.getIPStub.returns({provisioningState: 'Failed'});
    return {
      networkInterfaces: {
        beginCreateOrUpdate: async () => createOrUpdateNICStub(),
        beginDeleteMethod: async () => this.deleteNICStub(),
        get: async () => this.getNICStub(),
      },
      publicIPAddresses: {
        beginCreateOrUpdate: async () => createOrUpdateIPStub(),
        beginDeleteMethod: async () => this.deleteIPStub(),
        get: async () => this.getIPStub(),
      },
    };
  }

  compute() {
    const instanceData = {
      id: '/subscriptions/subscription-id/resourceGroups/group-name/providers/Microsoft.Compute/virtualMachines/test-vm',
      name: 'some vm',
      location: 'westus',
      storageProfile: {
        "osDisk": {
          "managedDisk": {
            "id": "/subscriptions/subscription-id/resourceGroups/group-name/providers/Microsoft.Compute/disks/test-disk",
            "resourceGroup": "group-name",
          },
          "name": "test-disk",
        },
      },
      osProfile: {
        computerName: 'test-vm',
        adminUsername: 'admin123',
      },
      networkProfile: {
        networkInterfaces: [
          {
            "id": "/subscriptions/subscription-id/resourceGroups/group-name/providers/Microsoft.Network/networkInterfaces/test-nic",
            "primary": true,
            "resourceGroup": "group-name",
          },
        ],
      },
      vmId: "5d06deb3-807b-46dd-aef5-78aaf9193f71",
      provisioningState: 'Creating',
    };

    const azureError = new Error("something went wrong");

    this.getVMStub = sinon.stub();
    // first call returns provisioningState Succeeded, second returns Failed
    this.getVMStub.onCall(0).returns({...instanceData, provisioningState: 'Succeeded'});
    this.getVMStub.onCall(1).returns({...instanceData, provisioningState: 'Failed'});
    this.getVMStub.onCall(2).throws(() => { return this.error(404); });

    const createOrUpdateVMStub = sinon.stub();
    createOrUpdateVMStub.onCall(0).returns(instanceData);
    createOrUpdateVMStub.onCall(1).throws(azureError);

    const instanceViewStub = sinon.stub();
    instanceViewStub.returns({statuses: [{code: 'PowerState/running'}]});

    this.deleteVMStub = sinon.stub();
    this.deleteVMStub.returns({});

    this.deleteDiskStub = sinon.stub();
    this.deleteDiskStub.returns({});

    this.getDiskStub = sinon.stub();
    this.getDiskStub.returns({provisioningState: 'Failed'});
    return {
      virtualMachines: {
        beginCreateOrUpdate: async () => createOrUpdateVMStub(),
        get: async () => this.getVMStub(),
        instanceView: async () => instanceViewStub(),
        beginDeleteMethod: async () => this.deleteVMStub(),
      },
      disks: {
        beginDeleteMethod: async () => this.deleteDiskStub(),
        get: async () => this.getDiskStub(),
      },
    };
  }
}

module.exports = {
  FakeAzure,
};
