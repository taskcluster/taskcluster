import Debug from 'debug';
import os from 'os';

let debug = Debug('taskcluster-docker-worker:devices:cpuDeviceManager');

export default class CpuDeviceManager {
  constructor() {
    this.devices = this.buildDeviceList();
  }

  buildDeviceList() {
    let deviceList = [];
    for (let i = 0; i < os.cpus().length; i++) {
      deviceList.push(new CpuDevice(i));
    }

    debug(`
      List of ${deviceList.length} cpus created.
      Devices: ${JSON.stringify(deviceList, null, 2)}
    `);

    return deviceList;
  }

  getAvailableDevice() {
    debug('Aquiring available cpu device');
    for (let device of this.devices) {
      if (device.active) continue;
      device.aquire();
      debug(`Device: ${device.id} aquired`);
      return device;
    }

    throw new Error(`
      Fatal error... Could not aquire cpu device:

      ${JSON.stringify(this.devices, null, 2)}
    `);
  }
}

class CpuDevice {
  constructor(id, active=false) {
    this.id = id
    this.active = active;
  }

  aquire() {
    if (this.active) throw new Error(`Device ${this.id} has already been aquired`);
    this.active = true;
  }

  release() {
    debug(`Device: ${this.id} released`);
    this.active = false;
  }

}
