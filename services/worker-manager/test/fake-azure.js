/**
 * This defines a fairly brittle and scripted
 * set of interactions that the azure provider makes
 * with the azure apis in order to test out our side of things
 * within the provider. This can either grow to be more flexible for
 * more testing later or we can come up with some other plan.
 */

const sinon = require("sinon");

class FakeAzure {
  constructor() {}

  error(code) {
    const err = new Error(code);
    err.code = code;
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

    const createOrUpdateIPStub = sinon.stub();
    createOrUpdateIPStub.returns({
      "id": "/subscriptions/subscription-id/resourceGroups/group-name/providers/Microsoft.Network/publicIPAddresses/test-ip",
      "location": "westus",
      "name": "test-ip",
    });

    this.deleteIPStub = sinon.stub();
    this.deleteIPStub.returns({});

    return {
      networkInterfaces: {
        createOrUpdate: async () => createOrUpdateNICStub(),
        deleteMethod: async () => this.deleteNICStub(),
      },
      publicIPAddresses: {
        createOrUpdate: async () => createOrUpdateIPStub(),
        deleteMethod: async () => this.deleteIPStub(),
      },
    };
  }

  compute() {
    const instanceData = {
      id: '/subscriptions/subscription-id/resourceGroups/group-name/providers/Microsoft.Compute/virtualMachines/test-vm',
      name: 'test-vm',
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
      vmId: "123",
      provisioningState: 'Creating',
    };

    const azureError = new Error("something went wrong");

    const getVMStub = sinon.stub();
    // first call returns provisioningState Creating, second returns Deallocated
    getVMStub.onCall(0).returns(instanceData);
    getVMStub.onCall(1).returns({...instanceData, provisioningState: 'Deallocated'});

    const createOrUpdateVMStub = sinon.stub();
    createOrUpdateVMStub.onCall(0).returns(instanceData);
    createOrUpdateVMStub.onCall(1).throws(azureError);

    const limitError = new Error("whatever");
    limitError.code = 429;
    createOrUpdateVMStub.onCall(2).throws(limitError);
    createOrUpdateVMStub.onCall(3).returns({
      id: '/subscriptions/subscription-id/resourceGroups/group-name/providers/Microsoft.Compute/virtualMachines/test-vm',
      name: 'test-vm',
      location: 'westus',
      vmId: '456',
    });

    this.deleteVMStub = sinon.stub();
    this.deleteVMStub.returns({});

    this.deleteDiskStub = sinon.stub();
    this.deleteDiskStub.returns({});

    return {
      virtualMachines: {
        createOrUpdate: async () => createOrUpdateVMStub(),
        get: async () => getVMStub(),
        deleteMethod: async () => this.deleteVMStub(),
      },
      disks: {
        deleteMethod: async () => this.deleteDiskStub(),
      },
    };
  }
}

module.exports = {
  FakeAzure,
};
