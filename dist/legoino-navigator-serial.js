/**
 * legoino-navigator-serial - Use navigator.serial to manage legoino devices
 * @version v0.0.0
 * @link https://github.com/hackuarium/legoino-navigator-serial#readme
 * @license MIT
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.LegoinoSerial = {}));
}(this, (function (exports) { 'use strict';

  class EventEmitter {
    constructor() {
      this.callbacks = {};
    }

    on(event, cb) {
      if (!this.callbacks[event]) this.callbacks[event] = [];
      this.callbacks[event].push(cb);
    }

    emit(event, data) {
      let cbs = this.callbacks[event];

      if (cbs) {
        cbs.forEach(cb => cb(data));
      }
    }

  }

  const randomInteger = (minimum, maximum) => Math.floor(Math.random() * (maximum - minimum + 1) + minimum);

  const createAbortError = () => {
    const error = new Error('Delay aborted');
    error.name = 'AbortError';
    return error;
  };

  const createDelay = ({
    clearTimeout: defaultClear,
    setTimeout: set,
    willResolve
  }) => (ms, {
    value,
    signal
  } = {}) => {
    if (signal && signal.aborted) {
      return Promise.reject(createAbortError());
    }

    let timeoutId;
    let settle;
    let rejectFn;
    const clear = defaultClear || clearTimeout;

    const signalListener = () => {
      clear(timeoutId);
      rejectFn(createAbortError());
    };

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', signalListener);
      }
    };

    const delayPromise = new Promise((resolve, reject) => {
      settle = () => {
        cleanup();

        if (willResolve) {
          resolve(value);
        } else {
          reject(value);
        }
      };

      rejectFn = reject;
      timeoutId = (set || setTimeout)(settle, ms);
    });

    if (signal) {
      signal.addEventListener('abort', signalListener, {
        once: true
      });
    }

    delayPromise.clear = () => {
      clear(timeoutId);
      timeoutId = null;
      settle();
    };

    return delayPromise;
  };

  const delay = createDelay({
    willResolve: true
  });
  delay.reject = createDelay({
    willResolve: false
  });

  delay.range = (minimum, maximum, options) => delay(randomInteger(minimum, maximum), options);

  delay.createWithTimers = ({
    clearTimeout,
    setTimeout
  }) => {
    const delay = createDelay({
      clearTimeout,
      setTimeout,
      willResolve: true
    });
    delay.reject = createDelay({
      clearTimeout,
      setTimeout,
      willResolve: false
    });
    return delay;
  };

  var delay_1 = delay; // TODO: Remove this for the next major release

  var _default = delay;
  delay_1.default = _default;

  function checkSerial(serial) {
    if (!serial) {
      console.error("Web serial doesn't seem to be enabled in your browser. Try enabling it by visiting:");
      console.error('chrome://flags/#enable-experimental-web-platform-features');
      console.error('opera://flags/#enable-experimental-web-platform-features');
      console.error('edge://flags/#enable-experimental-web-platform-features');
    }
  }

  const STATUS_CREATED = 0;
  const STATUS_COMMAND_SENT = 1;
  const STATUS_ANSWER_PARTIALLY_RECEIVED = 2;
  const STATUS_ANSWER_RECEIVED = 3;
  const STATUS_RESOLVED = 4;
  const STATUS_ERROR = 5;
  class Action {
    constructor(command, options = {}) {
      this.currentTimeout = undefined;
      this.command = command;
      this.timeout = options.timeout === undefined ? 1000 : options.timeout;
      this.answer = '';
      this.status = STATUS_CREATED;
      this.creationTimestamp = Date.now();
      this.promise = new Promise((resolve, reject) => {
        this.reject = reject;
        this.resolve = resolve;
      });
      this.finishedPromise = new Promise(resolve => {
        this.finished = resolve;
      });
    }

    isFinished() {
      return this.status === STATUS_RESOLVED || this.status === STATUS_ERROR;
    }

    setTimeout() {
      if (this.currentTimeout) {
        clearTimeout(this.currentTimeout);
      }

      this.currentTimeout = setTimeout(() => {
        if (this.status === STATUS_RESOLVED || this.status === STATUS_ERROR) {
          return;
        }

        this.status = STATUS_ERROR;
        this.reject('Timeout');
        this.finished();
      }, this.timeout);
    }

    start() {
      this.startTimestamp = Date.now();
      this.status = STATUS_COMMAND_SENT;
      this.setTimeout();
    }

    appendAnswer(buffer) {
      let string = new TextDecoder().decode(buffer);
      this.status = STATUS_ANSWER_PARTIALLY_RECEIVED;
      this.answer += string;
      if (!this.answer.replace(/\r/g, '').endsWith('\n\n')) return;
      let lines = this.answer.split(/\r?\n/);

      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines = lines.filter(line => line);
        this.status = STATUS_ANSWER_RECEIVED;
        this.resolve(lines.join('\n'));
        this.finished();
        this.status = STATUS_RESOLVED;
      }
    }

  }

  /* eslint-disable no-await-in-loop */
  const debug = console.log;
  const STATUS_OPENING = 1;
  const STATUS_OPENED = 2;
  const STATUS_CLOSED = 3;
  const STATUS_MISSING = 9;
  const STATUS_ERROR$1 = 10;
  class Device {
    constructor(serialPort, options = {}) {
      this.status = STATUS_OPENING;
      this.id = undefined;
      this.serialPort = serialPort;
      this.baudRate = options.baudRate || 115200;
      this.queue = [];
      this.action = undefined;
      this.interCommandDelay = options.interCommandDelay;
      this.defaultCommandExpirationDelay = 2000;
      this.encoder = new TextEncoder();
      this.decoder = new TextDecoder();
    }

    isReady() {
      return this.status === STATUS_OPENED;
    }
    /** restart process queue if the previous one was finished */


    async ensureProcessQueue() {
      debug('ensureProcessQueue');

      if (!this.currentProcessQueue) {
        this.currentProcessQueue = this.runProcessQueue();
      }

      return this.currentProcessQueue;
    }

    async runProcessQueue() {
      while (this.queue.length > 0) {
        this.action = this.queue.shift();

        if (this.action) {
          this.action.start();
          await this.write(`${this.action.command}\n`);
          await this.read(this.action);
          await this.action.finishedPromise;
          this.action = undefined;
          await delay_1(this.interCommandDelay);
        }
      }

      this.currentProcessQueue = undefined;
    }

    async getStatus() {
      return {
        value: this.status
      };
    }

    async ensureOpen() {
      debug(`Ensure open`);

      if (this.status !== STATUS_OPENED) {
        return this.open();
      }
    }

    async open() {
      debug(`Opening`);
      await this.serialPort.open({
        baudRate: this.baudRate
      });
      this.reader = this.serialPort.readable.getReader();
      this.writer = this.serialPort.writable.getWriter();
      this.id = await this.get('uq');
      this.status = STATUS_OPENED;
    }
    /*
     We need to add this command in the queue and wait it resolves or rejects
    */


    async get(command, options = {}) {
      const {
        commandExpirationDelay = this.defaultCommandExpirationDelay
      } = options;
      const action = new Action(command, {
        timeout: commandExpirationDelay
      });
      this.queue.push(action);
      this.ensureProcessQueue();
      return action.promise;
    }

    error(error) {
      debug(`Error ${this.port.path}`);
      debug(error);
      this.status = STATUS_ERROR$1;
      this.emit('adapter', {
        event: 'Error',
        value: error
      });
    }

    close() {
      debug(`Close`);
      this.status = STATUS_CLOSED;
    }

    async write(data) {
      const dataArrayBuffer = this.encoder.encode(data + '\n');
      return this.writer.write(dataArrayBuffer);
    }

    async read(action) {
      while (!action.isFinished()) {
        action.appendAnswer((await this.reader.read()).value);
        delay_1(10);
      }
    }

  }

  /* eslint-disable no-await-in-loop */
  const debug$1 = console.log;
  /**
   * Class creating a new serial bridge to manage serial ports.
   * @param {object} [options={}]
   * @param {function} [options.portFilter=[{usbProductId:37384, usbVendorId:6991}]] Filter the serial ports to address.
   * @param {number} [options.baudRate=57200] Baud rate
   * @param {number} [options.interCommandDelay=100] Time to wait between commands in [ms]
   * @param {number} [options.defaultCommandExpirationDelay=100] Time to wait for answer before timeout
   */

  class DevicesManager extends EventEmitter {
    constructor(serial, options = {}) {
      super();
      checkSerial(serial);
      this.serial = serial;
      this.devices = [];
      this.portFilter = options.portFilter === undefined ? [{
        usbProductId: 37384,
        usbVendorId: 6991
      }] : options.portFilter;
      this.baudRate = options.baudRate || 115200;
      this.interCommandDelay = options.interCommandDelay === undefined ? 100 : options.interCommandDelay;
      this.defaultCommandExpirationDelay = options.defaultCommandExpirationDelay === undefined ? 100 : options.defaultCommandExpirationDelay;
    }
    /**
     * By calling this method from a click you give users the possibility to allow access to some devices
     */


    async requestDevices() {
      await this.serial.requestPort({
        filters: this.portFilter
      });
      return this.updateDevices();
    }
    /**
     * Update this.devices
     */


    async updateDevices() {
      const serialPorts = await this.serial.getPorts();
      debug$1('updateDevices');
      const missingDevicesSerialPort = this.devices.filter(device => !serialPorts.includes(device.serialPort));

      for (let device of missingDevicesSerialPort) {
        if (device.status !== STATUS_MISSING && device.status !== STATUS_CLOSED) {
          device.close();
        }

        device.status = STATUS_MISSING;
      }

      for (let serialPort of serialPorts) {
        let device = this.devices.filter(device => device.serialPort === serialPort)[0];

        if (device) {
          await device.ensureOpen();
        } else {
          let newDevice = new Device(serialPort, {
            baudRate: this.baudRate,
            interCommandDelay: this.interCommandDelay,
            defaultCommandExpirationDelay: this.defaultCommandExpirationDelay
          });
          this.devices.push(newDevice);
          await newDevice.open();
        }
      } // check if there are any new ports

    }
    /**
     * Update this.devices every `scanInterval` [ms].
     * @param {object} [options={}]
     * @param {number} [options.scanInterval=1000] Delay between `updateDevices()` calls
     * @param {number} [options.callback] Callback to execute on each update
     */


    async continuousUpdateDevices(options = {}) {
      const {
        scanInterval = 1000,
        callback
      } = options;

      while (true) {
        await this.updateDevices();

        if (callback) {
          callback(this.devices);
        }

        await delay_1(scanInterval);
      }
    }
    /**
     * Returns this.devices
     * @param {object} [options={}]
     * @param {bool} [options.ready=false] If `true` returns only currently connected device. If `false` returns all devices ever connected.
     * @returns {Array<object>}
     */


    getDevicesList(options = {}) {
      let {
        ready = false
      } = options;
      return this.devices.filter(device => !ready || device.isReady()).map(device => ({
        status: device.status,
        id: device.id,
        queueLength: device.queue.length
      }));
    } // private function


    findDevice(id) {
      if (id === undefined) return undefined;
      let devices = this.devices.filter(device => device.id === id && device.status === STATUS_OPENED);
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

  exports.DevicesManager = DevicesManager;

  Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=legoino-navigator-serial.js.map
