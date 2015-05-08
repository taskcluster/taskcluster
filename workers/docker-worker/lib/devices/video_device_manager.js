import Debug from 'debug';
import fs from 'fs';

let debug = Debug('taskcluster-docker-worker:devices:videoManager');

const BASE_DIR = '/dev';

export default class VideoDeviceManager {
  constructor() {
    this.devices = this.buildDeviceList();
  }

  buildDeviceList() {
    let deviceList = [];
    let deviceFiles;
    try {
      deviceFiles = fs.readdirSync(BASE_DIR)
                        .filter((deviceFile) => {
                          return /^video[0-9]+$/.test(deviceFile);
                        });
    }
    catch (e) {
      debug(`Caught error when gathering video devices. ${e}`);
      return [];
    }

    deviceFiles.forEach((deviceFile) => {
      deviceList.push(new VideoDevice(`${BASE_DIR}/${deviceFile}`));
    });

    debug(`
      List of ${deviceList.length} video devices created.
      Devices: ${JSON.stringify(deviceList, null, 2)}
    `);

    return deviceList;
  }

  getAvailableDevice() {
    debug('Aquiring available video device');
    for (let device of this.devices) {
      if (device.active) continue;
      device.aquire();
      debug(`Device: ${device.path} aquired`);
      return device;
    }

    throw new Error(`
      Fatal error... Could not aquire video device:

      ${JSON.stringify(this.devices)}
    `);
  }
}

class VideoDevice {
  constructor(path, active=false) {
    this.active = active;
    this.path = path;
    this.mountPoints = [path];
  }

  aquire() {
    if (this.active) throw new Error('Device has already been aquired');
    this.active = true;
  }

  release() {
    debug(`Device: ${this.path} released`);
    this.active = false;
  }

}
