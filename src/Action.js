import delay from 'delay';

const STATUS_CREATED = 0;
const STATUS_COMMAND_SENT = 10;
const STATUS_WAITING_RECEIVING = 20;
const STATUS_ANSWER_PARTIALLY_RECEIVED = 30;
const STATUS_ANSWER_RECEIVED = 40;
const STATUS_RESOLVED = 50;
const STATUS_ERROR = 60;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export class Action {
  constructor(command, device, options = {}) {
    this.device = device;
    this.currentTimeout = undefined;
    this.command = command;
    this.timeout = options.timeout ?? 100;
    this.timeoutResolve = options.timeoutResolve ?? false;
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
    this.isEndCommandAnswer =
      options.isEndCommandAnswer ??
      (() => {
        throw new Error('isEndCommandAnswer is not defined');
      });
    this.endCommandAnswerCallback =
      options.endCommandAnswerCallback ??
      (() => {
        throw new Error('endCommandAnswerCallback is not defined');
      });
    this.logger?.info('Action created');
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
      if (this.timeoutResolve) {
        this.status = STATUS_RESOLVED;
        this.resolve(this.partialAnswer);
        this.device.terminal?.receive(this.partialAnswer);
        this.logger?.info(`Timeout resolved after ${this.timeout}ms`);
      } else {
        this.status = STATUS_ERROR;
        this.reject(this.partialAnswer);
        this.device.terminal?.receive(this.partialAnswer);
        this.logger?.error(`Timeout reject after ${this.timeout}ms`);
      }
    }, this.timeout);
  }

  async writeRead() {
    this.startTimestamp = Date.now();
    this.status = STATUS_COMMAND_SENT;
    await this.setTimeout();
    this.writeText(this.command)
      .then(async () => {
        await this.readText();
        this.status = STATUS_ANSWER_RECEIVED;
        this.answer = this.endCommandAnswerCallback(
          this.command,
          this.partialAnswer,
        );
      })
      .then(() => {
        this.status = STATUS_RESOLVED;
        this.resolve(this.answer);
      });
    return this.promise;
  }

  async writeText(command) {
    if (!command) return;
    const dataArrayBuffer = encoder.encode(`${command}\n`);
    this.device.terminal?.send(command);
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
      await delay(1);
    }
    this.device.terminal?.receive(this.partialAnswer);
  }
}
