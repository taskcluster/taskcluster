const Debug = require('debug');

let debug = Debug('taskcluster-docker-worker:devices:kvmManager');

class KvmDeviceManager {
  constructor() {
    this.devices = [new KvmDevice()];
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

class KvmDevice {
  constructor() {
    this.mountPoints = [
      '/dev/kvm',
    ];
  }

  acquire() {}

  release() {
    debug('Device: /dev/kvm released');
  }

}

module.exports = KvmDeviceManager;
