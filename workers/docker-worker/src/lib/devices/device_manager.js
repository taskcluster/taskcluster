const Debug = require('debug');

const VideoDeviceManager = require('./video_device_manager');
const AudioDeviceManager = require('./audio_device_manager');
const CpuDeviceManager = require('./cpu_device_manager');

let debug = Debug('taskcluster-docker-worker:deviceManager');

const DEVICE_MANAGERS = {
  'loopbackVideo': VideoDeviceManager,
  'loopbackAudio': AudioDeviceManager,
  'cpu': CpuDeviceManager,
};


class DeviceManager {
  constructor(config) {
    this.config = config;
    this.managers = this.initializeDeviceManagers();
    debug(`DeviceManager initialized with ${Object.keys(this.managers)} managers`);
  }

  initializeDeviceManagers() {
    let managers = {};
    for (let deviceManager in DEVICE_MANAGERS) {
      let deviceConfig = this.config.deviceManagement[deviceManager] || { enabled: false };
      if (deviceConfig.enabled) {
        managers[deviceManager] = new DEVICE_MANAGERS[deviceManager](this.config);
      }
    }

    return managers;
  }

  getDevice(deviceType) {
    if (!this.managers[deviceType]) {
      throw new Error('Unrecognized device requested');
    }

    return this.managers[deviceType].getAvailableDevice();
  }

  async getAvailableCapacity() {
    let devices = await Promise.all(Object.keys(this.managers).map(async (manager) => {
      let availableDevices = await this.managers[manager].getAvailableDevices();
      return availableDevices.length;
    }));

    return Math.min(...devices);
  }
}

module.exports = DeviceManager;
