const Debug = require('debug');

let debug = Debug('taskcluster-docker-worker:devices:sharedMemoryManager');

class SharedMemoryDeviceManager {
  constructor() {
    this.devices = [new SharedMemoryDevice()];
    this.unlimitedDevices = true;
  }

  getAvailableDevice() {
    let devices = this.getAvailableDevices();
    let device = devices[0];
    device.acquire();

    debug(`Device: ${device.path} acquired`);

    return device;
  }

  getAvailableDevices() {
    return this.devices;
  }
}

class SharedMemoryDevice {
  constructor() {
    this.mountPoints = [];
    this.binds = [
      '/dev/shm:/dev/shm',
    ];
  }

  acquire() {}

  release() {
    debug('Device: /dev/shm released');
  }

}

module.exports = SharedMemoryDeviceManager;
