

import delay from 'delay';

import { Action } from './Action';

const debug = () => {};

export const STATUS_OPENING = 1;
export const STATUS_OPENED = 2;
export const STATUS_CLOSED = 3;
export const STATUS_MISSING = 9;
export const STATUS_ERROR = 10;

export class Device {
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
    debug(`Ensure open`);
    if (this.status !== STATUS_OPENED) {
      return this.open();
    }
  }

  async open() {
    debug(`Opening`);
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
    this.id = await this.get('uq');
    this.status = STATUS_OPENED;
  }

  /*
   We need to add this command in the queue and wait it resolves or rejects
  */
  async get(command, options = {}) {
    const { commandExpirationDelay = this.defaultCommandExpirationDelay } =
      options;

    const action = new Action(command, {
      timeout: commandExpirationDelay,
    });

    this.queue.push(action);
    this.ensureProcessQueue();
    return action.promise;
  }

  error(error) {
    debug(`Error ${this.port.path}`);
    debug(error);
    this.status = STATUS_ERROR;
    this.emit('adapter', {
      event: 'Error',
      value: error,
    });
  }

  close() {
    debug(`Close`);
    this.status = STATUS_CLOSED;
  }

  async write(data) {
    const dataArrayBuffer = this.encoder.encode(`${data}\n`);
    return this.writer.write(dataArrayBuffer);
  }

  async read(action) {
    while (!action.isFinished()) {
      action.appendAnswer((await this.reader.read()).value);
      delay(10);
    }
  }
}
