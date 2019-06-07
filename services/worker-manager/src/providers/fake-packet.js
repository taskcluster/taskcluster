const slugid = require('slugid');
const assert = require('assert');
const _ = require('lodash');

class FakePacket {
  constructor() {
    this.spotRequests = {};
    this.devices = {};
  }

  createSpotRequest(projectId, parameters, callback) {
    const id = slugid.nice();
    const devices = {};

    assert.equal(typeof projectId, 'string');

    for (let i = 0; i < parameters.devices_max; ++i) {
      const id = slugid.nice();
      devices[id] = {
        id,
        state: null,
      };
    }

    Object.assign(this.devices, devices);

    const spotRequest = {
      id,
      devices: Object.keys(devices).map(id => {
        return {href: `/devices/${id}`};
      }),
    };

    this.spotRequests[id] = spotRequest;
    callback(null, spotRequest);
  }

  getSpotRequest(spotRequestId, callback) {
    callback(null, this.spotRequests[spotRequestId]);
  }

  removeDevice(devId, callback) {
    for (let id of Object.keys(this.spotRequests)) {
      this.spotRequests[id].devices = this.spotRequests[id]
        .devices
        .filter(dev => dev.href.split('/').pop() !== devId);
    }

    delete this.devices[devId];
    callback(null, null);
  }

  removeSpotRequest(spotRequestId, forceTermination, callback) {
    if (forceTermination) {
      this.spotRequests[spotRequestId]
        .devices
        .map(dev => dev.href.split('/').pop())
        .forEach(devId => delete this.devices[devId]);
    }

    delete this.spotRequests[spotRequestId];
    callback(null, null);
  }

  getDevices(projectId, devId, parameters, callback) {
    if (devId) {
      const dev = this.devices[devId];

      switch (dev.state) {
        case null:
          dev.state = "provisioning";
          break;
        case 'provisioning':
          dev.state = 'active';
          break;
        case 'active':
          dev.state = 'inactive';
          break;
      }

      callback(null, {
        devices: [dev],
      });
    } else {
      callback(null, {
        devices: _.filter(this.devices, dev => dev.state !== null),
      });
    }
  }
}

module.exports = {
  FakePacket,
};
