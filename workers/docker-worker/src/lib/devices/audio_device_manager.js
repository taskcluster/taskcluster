const Debug = require('debug');
const fs = require('fs');

let debug = Debug('taskcluster-docker-worker:devices:audioManager');

const BASE_DIR = '/dev/snd';

class AudioDeviceManager {
  constructor() {
    this.devices = this.buildDeviceList();
  }

  buildDeviceList() {
    let deviceList = [];
    let deviceFiles;
    try {
      deviceFiles = fs.readdirSync(BASE_DIR)
                        .filter((deviceFile) => {
                          return /^controlC[0-9]+$/.test(deviceFile);
                        });
    }
    catch (e) {
      debug(`Caught error when gathering audio devices. ${e.stack || e}`);
      return [];
    }

    deviceFiles.forEach((deviceFile) => {
      try {
        deviceList.push(new AudioDevice(`${BASE_DIR}/${deviceFile}`));
      }
      catch(e) {
        debug(`Could not create audio device. Error: ${e.stack || e}`);
      }
    });

    debug(`
      List of ${deviceList.length} audio devices created.
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

class AudioDevice {
  constructor(path, active=false) {
    this.path = path;
    this.active = active;
    let deviceId = path.match(/^\/dev\/snd\/controlC([0-9]+)$/);

    if (!deviceId) {
      throw new Error('Path does not appear to be a valid audio device file');
    }

    deviceId = deviceId[1];
    this.mountPoints = [
      `/dev/snd/controlC${deviceId}`,
      `/dev/snd/pcmC${deviceId}D0c`,
      `/dev/snd/pcmC${deviceId}D0p`,
      `/dev/snd/pcmC${deviceId}D1c`,
      `/dev/snd/pcmC${deviceId}D1p`
    ];
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

module.exports = AudioDeviceManager;
