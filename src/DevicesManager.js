/* eslint-disable no-await-in-loop */
import delay from 'delay';

import { Device, STATUS_MISSING, STATUS_OPENED, STATUS_CLOSED } from './Device';
import EventEmitter from './util/EventEmitter';
import checkSerial from './util/checkSerial';

const debug = () => {};

/**
 * Class creating a new serial bridge to manage serial ports.
 * @param {object} [options={}]
 * @param {function} [options.portFilter=[{usbProductId:37384, usbVendorId:6991}]] Filter the serial ports to address.
 * @param {number} [options.baudRate=57200] Baud rate
 * @param {number} [options.interCommandDelay=100] Time to wait between commands in [ms]
 * @param {number} [options.defaultCommandExpirationDelay=100] Time to wait for answer before timeout
 */
export class DevicesManager extends EventEmitter {
  constructor(serial, options = {}) {
    super();
    checkSerial(serial);
    this.serial = serial;
    this.devices = [];
    this.portFilter =
      options.portFilter === undefined
        ? [
            { usbProductId: 37384, usbVendorId: 6991 },
            { usbProductId: 60000, usbVendorId: 4292 },
          ]
        : options.portFilter;
    this.baudRate = options.baudRate || 115200;
    this.interCommandDelay =
      options.interCommandDelay === undefined ? 100 : options.interCommandDelay;
    this.defaultCommandExpirationDelay =
      options.defaultCommandExpirationDelay === undefined
        ? 100
        : options.defaultCommandExpirationDelay;
  }

  /**
   * By calling this method from a click you give users the possibility to allow access to some devices
   */
  async requestDevices() {
    await this.serial.requestPort({
      filters: this.portFilter,
    });
    return this.updateDevices();
  }

  /**
   * Update this.devices
   */
  async updateDevices() {
    const serialPorts = await this.serial.getPorts();

    debug('updateDevices');

    const missingDevicesSerialPort = this.devices.filter(
      (device) => !serialPorts.includes(device.serialPort),
    );
    for (let device of missingDevicesSerialPort) {
      if (device.status !== STATUS_MISSING && device.status !== STATUS_CLOSED) {
        device.close();
      }
      device.status = STATUS_MISSING;
    }

    for (let serialPort of serialPorts) {
      let device = this.devices.filter(
        (device) => device.serialPort === serialPort,
      )[0];
      if (device) {
        await device.ensureOpen();
      } else {
        let newDevice = new Device(serialPort, {
          baudRate: this.baudRate,
          interCommandDelay: this.interCommandDelay,
          defaultCommandExpirationDelay: this.defaultCommandExpirationDelay,
        });
        this.devices.push(newDevice);
        await newDevice.open();
      }
    }
    // check if there are any new ports
  }

  /**
   * Update this.devices every `scanInterval` [ms].
   * @param {object} [options={}]
   * @param {number} [options.scanInterval=1000] Delay between `updateDevices()` calls
   * @param {number} [options.callback] Callback to execute on each update
   */
  async continuousUpdateDevices(options = {}) {
    const { scanInterval = 1000, callback } = options;
    while (true) {
      await this.updateDevices();
      if (callback) {
        callback(this.devices);
      }
      await delay(scanInterval);
    }
  }

  /**
   * Returns this.devices
   * @param {object} [options={}]
   * @param {bool} [options.ready=false] If `true` returns only currently connected device. If `false` returns all devices ever connected.
   * @returns {Array<object>}
   */
  getDevicesList(options = {}) {
    let { ready = false } = options;
    return this.devices
      .filter((device) => !ready || device.isReady())
      .map((device) => ({
        status: device.status,
        id: device.id,
        queueLength: device.queue.length,
      }));
  }

  // private function
  findDevice(id) {
    if (id === undefined) return undefined;
    let devices = this.devices.filter(
      (device) => device.id === id && device.status === STATUS_OPENED,
    );
    if (devices.length === 0) return undefined;
    if (devices.length > 1) {
      throw new Error(`Many devices have the same id: ${id}`);
    }
    return devices[0];
  }

  /**
   * Send a serial command to a device.
   * @param {number} id ID of the device
   * @param {string} command Command to send
   */
  async sendCommand(id, command) {
    const device = this.findDevice(id);
    if (!device) {
      throw Error(`Device ${id} not found`);
    }
    if (device && device.isReady()) return device.get(command);
    throw Error(`Device ${id} not ready: ${device.port.path}`);
  }
}
