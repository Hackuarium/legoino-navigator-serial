/**
 * legoino-navigator-serial - Use navigator.serial to manage legoino devices
 * @version v0.2.2
 * @link https://github.com/hackuarium/legoino-navigator-serial#readme
 * @license MIT
 */
(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.LegoinoSerial = {}));
})(this, (function (exports) { 'use strict';

	var delay$2 = {exports: {}};

	// From https://github.com/sindresorhus/random-int/blob/c37741b56f76b9160b0b63dae4e9c64875128146/index.js#L13-L15
	const randomInteger = (minimum, maximum) => Math.floor(Math.random() * (maximum - minimum + 1) + minimum);
	const createAbortError = () => {
	  const error = new Error('Delay aborted');
	  error.name = 'AbortError';
	  return error;
	};
	const createDelay = _ref => {
	  let {
	    clearTimeout: defaultClear,
	    setTimeout: set,
	    willResolve
	  } = _ref;
	  return function (ms) {
	    let {
	      value,
	      signal
	    } = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
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
	};
	const createWithTimers = clearAndSet => {
	  const delay = createDelay({
	    ...clearAndSet,
	    willResolve: true
	  });
	  delay.reject = createDelay({
	    ...clearAndSet,
	    willResolve: false
	  });
	  delay.range = (minimum, maximum, options) => delay(randomInteger(minimum, maximum), options);
	  return delay;
	};
	const delay = createWithTimers();
	delay.createWithTimers = createWithTimers;
	delay$2.exports = delay;
	// TODO: Remove this for the next major release
	delay$2.exports.default = delay;
	var delay$1 = delay$2.exports;

	const STATUS_CREATED = 0;
	const STATUS_COMMAND_SENT = 10;
	const STATUS_ANSWER_PARTIALLY_RECEIVED = 30;
	const STATUS_ANSWER_RECEIVED = 40;
	const STATUS_RESOLVED = 50;
	const STATUS_ERROR$1 = 60;
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	class Action {
	  constructor(command, device) {
	    let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
	    this.device = device;
	    this.currentTimeout = undefined;
	    this.command = command;
	    this.timeout = options.timeout ?? 200;
	    this.timeoutResolve = options.timeoutResolve ?? false;
	    this.disableTerminal = options.disableTerminal ?? false;
	    this.kind = options.kind ?? 'writeRead';
	    this.answer = '';
	    this.partialAnswer = '';
	    this.logger = options.logger;
	    this.status = STATUS_CREATED;
	    this.creationTimestamp = Date.now();
	    this.promise = new Promise((resolve, reject) => {
	      this.reject = reject;
	      this.resolve = resolve;
	    });
	    this.isEndCommandAnswer = options.isEndCommandAnswer ?? (() => {
	      throw new Error('isEndCommandAnswer is not defined');
	    });
	    this.endCommandAnswerCallback = options.endCommandAnswerCallback ?? (() => {
	      throw new Error('endCommandAnswerCallback is not defined');
	    });
	    this.logger?.info('Action created');
	  }
	  isFinished() {
	    return this.status === STATUS_RESOLVED || this.status === STATUS_ERROR$1;
	  }
	  setTimeout() {
	    if (this.currentTimeout) {
	      clearTimeout(this.currentTimeout);
	    }
	    this.currentTimeout = setTimeout(() => {
	      if (this.status === STATUS_RESOLVED || this.status === STATUS_ERROR$1) {
	        return;
	      }
	      if (this.timeoutResolve) {
	        this.status = STATUS_RESOLVED;
	        this.resolve(this.partialAnswer);
	        !this.disableTerminal && this.device.terminal?.receive(this.partialAnswer);
	        this.logger?.info(`Timeout resolved after ${this.timeout}ms`);
	      } else {
	        this.status = STATUS_ERROR$1;
	        this.reject(this.partialAnswer);
	        !this.disableTerminal && this.device.terminal?.receive(this.partialAnswer);
	        this.logger?.error(`Timeout reject after ${this.timeout}ms`);
	      }
	    }, this.timeout);
	  }
	  async writeRead() {
	    this.startTimestamp = Date.now();
	    this.status = STATUS_COMMAND_SENT;
	    await this.setTimeout();
	    this.writeText(this.command).then(async () => {
	      await this.readText();
	      this.status = STATUS_ANSWER_RECEIVED;
	      this.answer = this.endCommandAnswerCallback(this.command, this.partialAnswer);
	    }).then(() => {
	      this.status = STATUS_RESOLVED;
	      this.resolve(this.answer);
	    });
	    return this.promise;
	  }
	  async writeText(command) {
	    if (!command) return;
	    const dataArrayBuffer = encoder.encode(`${command}\n`);
	    !this.disableTerminal && this.device.terminal?.send(command);
	    return this.device.writer.write(dataArrayBuffer);
	  }
	  async readText() {
	    this.status = STATUS_ANSWER_PARTIALLY_RECEIVED;
	    while (this.status === STATUS_ANSWER_PARTIALLY_RECEIVED) {
	      const chunk = await this.device.reader.read();
	      if (chunk.value.length > 0) {
	        // as long as we receive, we delay the timeout
	        this.setTimeout();
	      }
	      this.partialAnswer += decoder.decode(chunk.value);
	      if (this.isEndCommandAnswer(this.command, this.partialAnswer)) break;
	      await delay$1(5);
	    }
	    !this.disableTerminal && this.device.terminal?.receive(this.partialAnswer);
	  }
	}

	const STATUS_OPENING = 1;
	const STATUS_OPENED = 2;
	const STATUS_CLOSED = 3;
	const STATUS_MISSING = 9;
	const STATUS_ERROR = 10;
	const statusLabels = {
	  [STATUS_OPENING]: 'opening',
	  [STATUS_OPENED]: 'opened',
	  [STATUS_CLOSED]: 'closed',
	  [STATUS_MISSING]: 'missing',
	  [STATUS_ERROR]: 'error'
	};
	class Device {
	  constructor(serialPort) {
	    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	    const {
	      commandOptions = {},
	      deviceOptions = {}
	    } = options;
	    this.logger = options.logger;
	    this.terminal = options.terminal;
	    this.setStatus(STATUS_OPENING);
	    this.id = undefined;
	    this.serialPort = serialPort;
	    this.baudRate = deviceOptions.baudRate || 115200;
	    this.interCommandDelay = deviceOptions.interCommandDelay || 10;
	    this.getID = deviceOptions.getID ?? (async device => {
	      return `${device.usbVendorId}-${device.usbProductId}`;
	    });
	    this.timeout = deviceOptions.timeout || 100;
	    this.commandOptions = commandOptions;
	    this.queue = [];
	    this.action = undefined;
	    this.usbVendorId = options.usbVendorId;
	    this.usbProductId = options.usbProductId;
	    this.logger?.info(`Device created`);
	  }
	  setStatus(status) {
	    this.status = status;
	    this.statusLabel = statusLabels[status];
	  }
	  isReady() {
	    return this.status === STATUS_OPENED;
	  }

	  /** restart process queue if the previous one was finished */
	  async ensureProcessQueue() {
	    this.logger?.info('ensureProcessQueue');
	    if (!this.currentProcessQueue) {
	      this.currentProcessQueue = this.runProcessQueue();
	    }
	    return this.currentProcessQueue;
	  }
	  async runProcessQueue() {
	    while (this.queue.length > 0) {
	      this.action = this.queue.shift();
	      if (this.action) {
	        await this.action.writeRead().then(value => {
	          this.logger?.info({
	            command: this.action.command,
	            answer: this.action.answer
	          }, 'Resolve writeRead command');
	        }).catch(error => {
	          this.logger?.error({
	            command: this.action?.command,
	            answer: this.action.partialAnswer
	          }, error.toString());
	        });
	        this.action = undefined;
	        await delay$1(this.interCommandDelay);
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
	    this.logger?.trace(`Ensure open`);
	    let counter = 0;
	    // we wait for the serial port to be opened for max 1s
	    while (this.status === STATUS_OPENING && counter++ < 100) {
	      await delay$1(10);
	    }
	    if (this.status !== STATUS_OPENED) {
	      return this.open();
	    }
	  }
	  async open() {
	    this.logger?.info(`Opening`);
	    await this.serialPort.open({
	      baudRate: this.baudRate
	    }).catch(error => {
	      this.error(error);
	      this.close();
	    }).then(() => {
	      this.ensureOpen();
	    });
	    this.reader = this.serialPort.readable.getReader();
	    this.writer = this.serialPort.writable.getWriter();
	    this.logger?.info(`Getting id`);
	    this.id = await this.getID(this);
	    this.logger?.info(`Id: ${this.id}`);
	    this.setStatus(STATUS_OPENED);
	  }

	  /*
	   We need to add this command in the queue and wait it resolves or rejects
	  */
	  async get(command) {
	    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	    const {
	      timeout = this.timeout,
	      timeoutResolve = false,
	      disableTerminal = false,
	      unique = false
	    } = options;
	    if (unique && (this.action?.command === command || this.queue.find(action => action.command === command))) {
	      return;
	    }
	    const action = new Action(command, this, {
	      ...this.commandOptions,
	      timeout,
	      timeoutResolve,
	      disableTerminal,
	      logger: this.logger.child({
	        kind: 'Command',
	        command
	      })
	    });
	    this.queue.push(action);
	    this.ensureProcessQueue();
	    return action.promise;
	  }
	  error(error) {
	    this.logger?.error(error, `Error ${this.serialPort?.path}`);
	    this.setStatus(STATUS_ERROR);
	    /**
	    this.emit('adapter', {
	      event: 'Error',
	      value: error,
	    });
	    **/
	  }

	  close() {
	    this.logger?.info(`Close`);
	    this.setStatus(STATUS_CLOSED);
	  }
	}

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

	/* eslint-disable no-console */
	function checkSerial(serial) {
	  if (!serial) {
	    console.error("Web serial doesn't seem to be enabled in your browser. Try enabling it by visiting:");
	    console.error('chrome://flags/#enable-experimental-web-platform-features');
	    console.error('opera://flags/#enable-experimental-web-platform-features');
	    console.error('edge://flags/#enable-experimental-web-platform-features');
	  }
	}

	/**
	 * Class creating a new serial bridge to manage serial ports.
	 * @param {object} [options={}]
	 * @param {Array} [options.portFilter] Filter the serial ports to address.
	 * @param {object} [options.command={}]
	 * @param {number} [options.command.timeout=100] Time to wait for answer before timeout
	 * @param {Function} [options.command.isEndCommandAnswer]
	 * @param {Function} [options.command.endCommandAnswerCallback]
	 * @param {object} [options.device={}]
	 * @param {AsyncFunction} [options.device.getID=(device)=>()] Time to wait between commands in [ms]
	 * @param {number} [options.device.baudRate=115200] Baud rate
	 * @param {number} [options.device.interCommandDelay=100] Time to wait between commands in [ms]
	 */
	class DevicesManager extends EventEmitter {
	  constructor(serial) {
	    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	    super();
	    checkSerial(serial);
	    this.serial = serial;
	    this.terminal = options.terminal;
	    this.logger = options.logger;
	    this.devices = [];
	    this.portFilter = options.portFilter;
	    this.commandOptions = options.command ?? {};
	    this.deviceOptions = options.device ?? {};
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
	    this.logger?.trace('start updateDevices');
	    const missingDevicesSerialPort = this.devices.filter(device => !serialPorts.includes(device.serialPort));
	    for (let device of missingDevicesSerialPort) {
	      if (device.status !== STATUS_MISSING && device.status !== STATUS_CLOSED) {
	        device.close();
	      }
	      device.status = STATUS_MISSING;
	    }
	    for (let serialPort of serialPorts) {
	      let device = this.devices.find(device => device.serialPort === serialPort);
	      if (device) {
	        await device.ensureOpen();
	      } else {
	        const serialPortInfo = serialPort.getInfo();
	        let newDevice = new Device(serialPort, {
	          baudRate: this.baudRate,
	          terminal: this.terminal,
	          ...serialPortInfo,
	          commandOptions: this.commandOptions,
	          deviceOptions: this.deviceOptions,
	          logger: this.logger.child({
	            kind: 'Device',
	            ...serialPort.getInfo()
	          })
	        });
	        this.devices.push(newDevice);
	        await newDevice.open();
	      }
	    }
	    this.logger?.trace('finish updateDevices');
	  }

	  /**
	   * Update this.devices every `scanInterval` [ms].
	   * @param {object} [options={}]
	   * @param {number} [options.scanInterval=1000] Delay between `updateDevices()` calls
	   * @param {number} [options.callback] Callback to execute on each update
	   */
	  async continuousUpdateDevices() {
	    let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
	    const {
	      scanInterval = 1000,
	      callback
	    } = options;
	    while (true) {
	      await this.updateDevices();
	      if (callback) {
	        callback(this.devices);
	      }
	      await delay$1(scanInterval);
	    }
	  }

	  /**
	   * Returns this.devices
	   * @param {object} [options={}]
	   * @param {bool} [options.ready=false] If `true` returns only currently connected device. If `false` returns all devices ever connected.
	   * @returns {Array<object>}
	   */
	  getDevicesList() {
	    let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
	    let {
	      ready = false
	    } = options;
	    return this.devices.filter(device => !ready || device.isReady()).map(device => ({
	      status: device.status,
	      id: device.id,
	      queueLength: device.queue.length
	    }));
	  }

	  // private function
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
	   * @param {object} [options={}] options
	   * @param {number} [options.timeout] Timeout in [ms]
	   * @param {boolean} [options.timeoutResolve=false] If `true` the promise will resolve even if the command timed out
	   * @param {boolean} [options.disableTerminal=false]
	   */
	  async sendCommand(id, command) {
	    let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
	    const device = this.findDevice(id);
	    if (!device) {
	      throw Error(`Device ${id} not found`);
	    }
	    if (device && device.isReady()) {
	      return device.get(command, options);
	    }
	    throw Error(`Device ${id} not ready: ${device.port.path}`);
	  }
	}

	var IDX = 256,
	  HEX = [],
	  BUFFER;
	while (IDX--) HEX[IDX] = (IDX + 256).toString(16).substring(1);
	function v4() {
	  var i = 0,
	    num,
	    out = '';
	  if (!BUFFER || IDX + 16 > 256) {
	    BUFFER = Array(i = 256);
	    while (i--) BUFFER[i] = 256 * Math.random() | 0;
	    i = IDX = 0;
	  }
	  for (; i < 16; i++) {
	    num = BUFFER[IDX + i];
	    if (i == 6) out += HEX[num & 15 | 64];else if (i == 8) out += HEX[num & 63 | 128];else out += HEX[num];
	    if (i & 1 && i > 1 && i < 11) out += '-';
	  }
	  IDX++;
	  return out;
	}

	class Terminal {
	  constructor() {
	    let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
	    this.start = Date.now();
	    this.lineNumber = 0;
	    this.eventNumber = 0;
	    this.limit = options.limit ?? 1000;
	    this.onChange = options.onChange;
	    this.ignoreSend = options.ignoreSend ?? [];
	    this.ignoreReceive = options.ignoreReceive ?? [];
	    this.showSpecial = options.showSpecial ?? true;
	    this.sendColor = options.sendColor ?? '#efcef2';
	    this.receiveColor = options.receiveColor ?? '#bbeeb7';
	    this.events = [];
	  }
	  send(text) {
	    this.append(text, 'send');
	  }
	  receive(text) {
	    this.append(text, 'receive');
	  }
	  shouldIgnore(line, kind) {
	    const ignores = kind === 'send' ? this.ignoreSend : this.ignoreReceive;
	    for (let ignore of ignores) {
	      if (ignore.test(line)) {
	        return true;
	      }
	    }
	    return false;
	  }
	  append(text, kind) {
	    const lines = splitInLines(text, this.showSpecial);
	    this.eventNumber++;
	    const newEvents = [];
	    for (let line of lines) {
	      this.lineNumber++;
	      const event = {
	        uuid: v4(),
	        time: Math.round(Date.now() - this.start),
	        lineNumber: this.lineNumber,
	        eventNumber: this.eventNumber,
	        kind,
	        line
	      };
	      if (!this.shouldIgnore(line, kind)) {
	        newEvents.push(event);
	        this.events.push(event);
	      }
	    }
	    if (this.events.length > this.limit) {
	      this.events.splice(0, this.events.length - this.limit);
	    }
	    this.onChange?.(newEvents, this.events);
	  }
	  toHtml() {
	    let html = [];
	    html.push('<div style="background-color:black">');
	    for (let event of this.events) {
	      html.push(`<div style="color: ${event.kind === 'send' ? this.sendColor : this.receiveColor}">${(event.time / 1000).toFixed(3)}: ${htmlEscape(event.line)}</div>`);
	    }
	    html.push('</div>');
	    return html.join('\n');
	  }
	}
	function splitInLines(text, showSpecial) {
	  if (showSpecial) {
	    text = text.replace(/\r/g, '<CR>').replace(/\n/g, '<LF>\n').replace(/\t/g, '<TAB>\t');
	  }
	  return text.replace(/[\r\n]+$/, '').split(/\r?\n/);
	}
	function htmlEscape(str) {
	  return str.replace(/&/g, '&amp').replace(/>/g, '&gt').replace(/</g, '&lt');
	}

	const alarmsDescription = {
	  1: 'Hard limit triggered. Machine position is likely lost due to sudden and immediate halt. Re-homing is highly recommended.',
	  2: 'G-code motion target exceeds machine travel. Machine position safely retained. Alarm may be unlocked.',
	  3: 'Reset while in motion. Grbl cannot guarantee position. Lost steps are likely. Re-homing is highly recommended.',
	  4: 'Probe fail. The probe is not in the expected initial state before starting probe cycle, where G38.2 and G38.3 is not triggered and G38.4 and G38.5 is triggered.',
	  5: 'Probe fail. Probe did not contact the workpiece within the programmed travel for G38.2 and G38.4.',
	  6: 'Homing fail. Reset during active homing cycle.',
	  7: 'Homing fail. Safety door was opened during active homing cycle.',
	  8: 'Homing fail. Cycle failed to clear limit switch when pulling off. Try increasing pull-off setting or check wiring.',
	  9: 'Homing fail. Could not find limit switch within search distance. Defined as `1.5 * max_travel` on search and `5 * pulloff` on locate phases.'
	};

	const errorsDescription = {
	  1: 'G-code words consist of a letter and a value. Letter was not found.',
	  2: 'Numeric value format is not valid or missing an expected value.',
	  3: 'Grbl `$` system command was not recognized or supported.',
	  4: 'Negative value received for an expected positive value.',
	  5: 'Homing cycle is not enabled via settings.',
	  6: 'Minimum step pulse time must be greater than 3usec',
	  7: 'EEPROM read failed. Reset and restored to default values.',
	  8: 'Grbl `$` command cannot be used unless Grbl is IDLE. Ensures smooth operation during a job.',
	  9: 'G-code locked out during alarm or jog state',
	  10: 'Soft limits cannot be enabled without homing also enabled.',
	  11: 'Max characters per line exceeded. Line was not processed and executed.',
	  12: '(Compile Option) Grbl `$` setting value exceeds the maximum step rate supported.',
	  13: 'Safety door detected as opened and door state initiated.',
	  14: '(Grbl-Mega Only) Build info or startup line exceeded EEPROM line length limit.',
	  15: 'Jog target exceeds machine travel. Command ignored.',
	  16: 'Jog command with no `=` or contains prohibited g-code.',
	  17: 'Laser mode disabled. Requires PWM output.',
	  20: 'Unsupported or invalid g-code command found in block.',
	  21: 'More than one g-code command from same modal group found in block.',
	  22: 'Feed rate has not yet been set or is undefined.',
	  23: 'G-code command in block requires an integer value.',
	  24: 'Two G-code commands that both require the use of the `XYZ` axis words were detected in the block.',
	  25: 'A G-code word was repeated in the block.',
	  26: 'A G-code command implicitly or explicitly requires `XYZ` axis words in the block, but none were detected.',
	  27: '`N` line number value is not within the valid range of `1` - `9,999,999`.',
	  28: 'A G-code command was sent, but is missing some required `P` or `L` value words in the line.',
	  29: 'Grbl supports six work coordinate systems `G54-G59`. `G59.1`, `G59.2`, and `G59.3` are not supported.',
	  30: 'The `G53` G-code command requires either a `G0` seek or `G1` feed motion mode to be active. A different motion was active.',
	  31: 'There are unused axis words in the block and `G80` motion mode cancel is active.',
	  32: 'A `G2` or `G3` arc was commanded but there are no `XYZ` axis words in the selected plane to trace the arc.',
	  33: 'The motion command has an invalid target. `G2`, `G3`, and `G38.2` generates this error, if the arc is impossible to generate or if the probe target is the current position.',
	  34: 'A `G2` or `G3` arc, traced with the radius definition, had a mathematical error when computing the arc geometry. Try either breaking up the arc into semi-circles or quadrants, or redefine them with the arc offset definition.',
	  35: 'A `G2` or `G3` arc, traced with the offset definition, is missing the `IJK` offset word in the selected plane to trace the arc.',
	  36: "There are unused, leftover G-code words that aren't used by any command in the block.",
	  37: 'The `G43.1` dynamic tool length offset command cannot apply an offset to an axis other than its configured axis. The Grbl default axis is the Z-axis.',
	  38: 'Tool number greater than max supported value.'
	};

	const parametersDescription = {};

	const settingsDescription = {
	  $0: 'Step pulse time, microseconds',
	  $1: 'Step idle delay, milliseconds',
	  $2: 'Step pulse invert, mask',
	  $3: 'Step direction invert, mask',
	  $4: 'Invert step enable pin, boolean',
	  $5: 'Invert limit pins, boolean',
	  $6: 'Invert probe pin, boolean',
	  $10: 'Status report options, mask',
	  $11: 'Junction deviation, millimeters',
	  $12: 'Arc tolerance, millimeters',
	  $13: 'Report in inches, boolean',
	  $20: 'Soft limits enable, boolean',
	  $21: 'Hard limits enable, boolean',
	  $22: 'Homing cycle enable, boolean',
	  $23: 'Homing direction invert, mask',
	  $24: 'Homing locate feed rate, mm/min',
	  $25: 'Homing search seek rate, mm/min ',
	  $26: 'Homing switch debounce delay, milliseconds',
	  $27: 'Homing switch pull-off distance, millimeters',
	  $30: 'Maximum spindle speed, RPM',
	  $31: 'Minimum spindle speed, RPM',
	  $32: 'Laser-mode enable, boolean',
	  $100: 'X-axis steps per millimeter',
	  $101: 'Y-axis steps per millimeter',
	  $102: 'Z-axis steps per millimeter',
	  $110: 'X-axis maximum rate, mm/min',
	  $111: 'Y-axis maximum rate, mm/min',
	  $112: 'Z-axis maximum rate, mm/min',
	  $120: 'X-axis acceleration, mm/sec^2',
	  $121: 'Y-axis acceleration, mm/sec^2',
	  $122: 'Z-axis acceleration, mm/sec^2',
	  $130: 'X-axis maximum travel, millimeters',
	  $131: 'Y-axis maximum travel, millimeters',
	  $132: 'Z-axis maximum travel, millimeters'
	};

	// format description: https://github.com/gnea/grbl/edit/master/doc/markdown/interface.md
	const MAX_ERRORS_MESSAGES = 20;

	/**
	 * @typedef {Object} State
	 * @property {object[]} [state.messages=[]]
	 * @property {object} [state.status={}]
	 * @property {object} [state.settings={}]
	 * @property {object} [state.parameters={}]
	 * @property {string} [state.version='']
	 */

	/**
	 *
	 * @param {string} input
	 * @param {State} [state={}]
	 * @returns
	 */
	function updateState(input) {
	  let state = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	  if (!input) return;
	  const lines = input.split(/\r?\n/);
	  for (let line of lines) {
	    if (line.startsWith('<')) {
	      parseQuestionMark(line, state);
	    }
	    if (line.startsWith('[')) {
	      parseSquareBracket(line, state);
	    }
	    if (line.startsWith('$')) {
	      parseSettings(line, state);
	    }
	    if (line.startsWith('Grbl')) {
	      state.version = line.replace('Grbl ', '');
	    }
	    if (line.startsWith('error')) {
	      parseErrors(line, state);
	    }
	    if (line.includes('ALARM')) {
	      parseAlarms(line, state);
	    }
	  }
	}

	/**
	 *
	 * @param {string} line
	 * @param {State} [state={}]
	 * @returns
	 */
	function parseErrors(line, state) {
	  const [, error] = line.split(':');
	  appendMessage({
	    kind: 'ERROR',
	    code: error,
	    description: errorsDescription[error]
	  }, state);
	}

	/**
	 *
	 * @param {string} line
	 * @param {State} [state={}]
	 * @returns
	 */
	function parseAlarms(line, state) {
	  const [, alarm] = line.split(':');
	  appendMessage({
	    kind: 'ALARM',
	    code: alarm,
	    description: alarmsDescription[alarm]
	  }, state);
	}

	/**
	 *
	 * @param {string} line
	 * @param {State} [state]
	 * @return
	 */
	function parseSettings(line, state) {
	  const [key, value] = line.split('=');
	  state.settings[key] = {
	    key,
	    description: settingsDescription[key],
	    value: Number(value)
	  };
	}
	const keyMappings = {
	  HLP: 'Help',
	  MSG: 'Message',
	  GC: 'GCode',
	  VER: 'Version',
	  OPT: 'Option',
	  echo: 'Echo'
	};

	/**
	 *
	 * @param {string} line
	 * @param {State} [state={}]
	 * @returns
	 */
	function parseSquareBracket(line) {
	  let state = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	  const [key, value] = line.replace(/\[(.*)\]/, '$1').split(':');
	  const description = line.replace(/\[(.*)\]/, '$1').split(':').slice(1).join(':');
	  switch (key) {
	    case 'echo':
	    case 'VER':
	    case 'OPT':
	    case 'HLP':
	    case 'GC':
	    case 'MSG':
	      appendMessage({
	        kind: keyMappings[key],
	        description
	      }, state);
	      return;
	    default:
	      state.parameters[key] = {
	        key,
	        description: parametersDescription[key],
	        value: value.split(',').map(field => Number(field))
	      };
	  }
	}

	/**
	 *
	 * @param {string} line
	 * @param {State} [state]
	 * @returns
	 */
	function parseQuestionMark(line) {
	  let state = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	  //  <Idle|MPos:0.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000>
	  const parts = line.replace(/<(.*)>/, '$1').split('|');
	  const status = {
	    value: parts[0]
	  };
	  status.Pn = [false, false, false];
	  for (let i = 1; i < parts.length; i++) {
	    const [key, value] = parts[i].split(':');
	    if (key === 'Pn') {
	      status[key] = [value.includes('X'), value.includes('Y'), value.includes('Z')];
	    } else {
	      status[key] = value.split(',').map(v => Number(v));
	    }
	  }
	  state.status = {
	    ...state.status,
	    ...status
	  };
	}
	function appendMessage(message, state) {
	  state.messages.push({
	    epoch: Date.now(),
	    ...message
	  });
	  if (state.messages.length > MAX_ERRORS_MESSAGES) {
	    state.messages.splice(0, state.messages.length - MAX_ERRORS_MESSAGES);
	  }
	  console.log(state.messages);
	}

	function getEmptyState() {
	  return {
	    messages: [],
	    status: {},
	    settings: {},
	    parameters: {},
	    version: '',
	    gcode: {
	      currentLine: 0,
	      sentLine: 1
	    }
	  };
	}
	const GRBL = {
	  updateState,
	  getEmptyState
	};

	exports.DevicesManager = DevicesManager;
	exports.GRBL = GRBL;
	exports.Terminal = Terminal;

	Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=legoino-navigator-serial.js.map
