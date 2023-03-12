import delay from 'delay';

import { Action } from './Action';

export const STATUS_OPENING = 1;
export const STATUS_OPENED = 2;
export const STATUS_CLOSED = 3;
export const STATUS_MISSING = 9;
export const STATUS_ERROR = 10;
const statusLabels = {
  [STATUS_OPENING]: 'opening',
  [STATUS_OPENED]: 'opened',
  [STATUS_CLOSED]: 'closed',
  [STATUS_MISSING]: 'missing',
  [STATUS_ERROR]: 'error',
};

export class Device {
  constructor(serialPort, options = {}) {
    const { commandOptions = {}, deviceOptions = {} } = options;
    this.logger = options.logger;
    this.terminal = options.terminal;
    this.setStatus(STATUS_OPENING);
    this.id = undefined;
    this.serialPort = serialPort;
    this.baudRate = deviceOptions.baudRate || 115200;
    this.interCommandDelay = deviceOptions.interCommandDelay || 10;
    this.getID =
      deviceOptions.getID ??
      (async (device) => {
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
        await this.action
          .writeRead()
          .then((value) => {
            this.logger?.info(
              { command: this.action.command, answer: this.action.answer },
              'Resolve writeRead command',
            );
          })
          .catch((error) => {
            this.logger?.error(
              {
                command: this.action.command,
                answer: this.action.partialAnswer,
              },
              error.toString(),
            );
          });

        this.action = undefined;
        await delay(this.interCommandDelay);
      }
    }
    this.currentProcessQueue = undefined;
  }

  async getStatus() {
    return {
      value: this.status,
    };
  }

  async ensureOpen() {
    this.logger?.trace(`Ensure open`);
    let counter = 0;
    // we wait for the serial port to be opened for max 1s
    while (this.status === STATUS_OPENING && counter++ < 100) {
      await delay(10);
    }

    if (this.status !== STATUS_OPENED) {
      return this.open();
    }
  }

  async open() {
    this.logger?.info(`Opening`);
    await this.serialPort
      .open({
        baudRate: this.baudRate,
      })
      .catch((error) => {
        this.error(error);
        this.close();
      })
      .then(() => {
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
  async get(command, options = {}) {
    const {
      timeout = this.timeout,
      timeoutResolve = false,
      disableTerminal = false,
    } = options;

    const action = new Action(command, this, {
      ...this.commandOptions,
      timeout,
      timeoutResolve,
      disableTerminal,
      logger: this.logger.child({ kind: 'Command', command }),
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
