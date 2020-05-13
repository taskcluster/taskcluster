const assert = require('assert');
const Debug = require('debug');
const os = require('os');

let debug = Debug('taskcluster-docker-worker:devices:cpuDeviceManager');

class CpuDeviceManager {
  constructor() {
    this.devices = this.buildDeviceList();
  }

  buildDeviceList() {
    let deviceList = [];
    for (let i = 0; i < os.cpus().length; i++) {
      deviceList.push(new CpuDevice(String(i)));
    }

    debug(`
      List of ${deviceList.length} cpus created.
      Devices: ${JSON.stringify(deviceList, null, 2)}
    `);

    return deviceList;
  }

  getAvailableDevice() {
    let devices = this.getAvailableDevices();
    if (!devices.length) {
      throw new Error(`
        Fatal error... Could not aquire cpu device:

        ${JSON.stringify(this.devices)}
      `);
    }

    debug('Aquiring available device');

    let device = devices[0];
    device.aquire();

    debug(`Device: ${device.id} aquired`);

    return device;
  }

  getAvailableDevices() {
    return this.devices.filter((device) => {
      return device.active === false;
    });
  }
}

class CpuDevice {
  constructor(id, active=false) {
    // ID must be a string to be passed in the docker config option CpusetCpus
    assert(typeof id === 'string', 'ID Must be a string');
    this.id = id;
    this.active = active;
  }

  aquire() {
    if (this.active) {
      throw new Error(`Device ${this.id} has already been aquired`);
    }

    this.active = true;
  }

  release() {
    debug(`Device: ${this.id} released`);
    this.active = false;
  }

}

module.exports = CpuDeviceManager;
