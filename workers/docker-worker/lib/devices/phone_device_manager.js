import assert from 'assert';
import Debug from 'debug';

import Testdroid from 'testdroid-client';

let debug = Debug('taskcluster-docker-worker:devices:phoneManager');

export default class PhoneDeviceManager {
  constructor(config) {
    assert(config.deviceManagement.phone.sims, 'Must supply the number of sims required');
    assert(config.deviceManagement.phone.type, 'Must supply the type of phone');
    assert(config.testdroid, 'Must supply testdroid configuration');
    assert(config.testdroid.url, 'Must supply testdroid cloud url');
    assert(config.testdroid.username, 'Must supply testdroid cloud username');
    assert(config.testdroid.password, 'Must supply testdroid cloud password');

    this.config = config;
    this.client = new Testdroid(
        config.testdroid.url,
        config.testdroid.username,
        config.testdroid.password
    );

    this.deviceFilter = {
      type: config.deviceManagement.phone.type,
      sims: config.deviceManagement.phone.sims
    };

    this.devices = [];
  }

  async getDevices() {
    let retrievedDevices = await this.client.getDevices(this.deviceFilter);
    let knownDeviceIds = this.devices.map(device => { return device.id; });

    retrievedDevices.forEach((device) => {
      if (knownDeviceIds.indexOf(device.id) === -1) {
        this.devices.push(new Phone (device));
      }
    });

    let retrievedDeviceIds = retrievedDevices.map(device => { return device.id; });
    knownDeviceIds.forEach((knownId) => {
      if (retrievedDeviceIds.indexOf(knownId) === -1) {
        let device = this.devices.find(knownDevice => { return knownDevice.id === knownId; });
        // If for some reason device is in use by a task, don't remove it.
        if (device.active) return;

        // Remove device as it's no longer being reported by the API
        debug(`removing device, no longer reported in api. Device ID: ${device.id}`);
        this.devices.splice(this.devices.indexOf(device), 1);
      }
    });

    debug(`List of ${this.devices.length} phones created`);
    return this.devices;
  }

  async getAvailableDevice() {
    let devices = await this.getAvailableDevices();

    if (!devices.length) {
      throw new Error('Fatal error... Could not acquire testdroid device');
    }

    debug('Acquiring available testdroid device');

    let device = devices[0];
    device.acquire();

    return device;
  }

  async getAvailableDevices() {
    let devices = await this.getDevices();

    return devices.filter((device) => {
      return device.active === false;
    });
  }
}

class Phone {
  constructor(deviceInfo) {
    this.id = deviceInfo.id;
    this.active = (deviceInfo.online && deviceInfo.locked !== false);
    this.mountPoints = [];
  }

  acquire() {
    // Not yet implemented
    return;
  }

  release() {
    // Not yet implemented
    return;
  }
}
