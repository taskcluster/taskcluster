const Debug = require('debug');
const fs = require('fs');

let debug = Debug('taskcluster-docker-worker:devices:videoManager');

const BASE_DIR = '/dev';

class VideoDeviceManager {
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
      debug(`Caught error when gathering video devices. ${e.stack || e}`);
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
    let devices = this.getAvailableDevices();
    if (!devices.length) {
      throw new Error(`
        Fatal error... Could not acquire audio device: ${JSON.stringify(this.devices)}
      `);
    }

    debug('Acquiring available device');

    let device = devices[0];
    device.acquire();

    debug(`Device: ${device.path} acquired`);

    return device;
  }

  getAvailableDevices() {
    return this.devices.filter((device) => {
      return device.active === false;
    });
  }
}

class VideoDevice {
  constructor(path, active=false) {
    this.active = active;
    this.path = path;
    this.mountPoints = [path];
  }

  acquire() {
    if (this.active) {
      throw new Error('Device has already been acquired');
    }
    this.active = true;
  }

  release() {
    debug(`Device: ${this.path} released`);
    this.active = false;
  }

}

module.exports = VideoDeviceManager;
