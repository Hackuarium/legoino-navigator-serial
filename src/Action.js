import delay from 'delay';

const STATUS_CREATED = 0;
const STATUS_COMMAND_SENT = 1;
const STATUS_ANSWER_PARTIALLY_RECEIVED = 2;
const STATUS_ANSWER_RECEIVED = 3;
const STATUS_RESOLVED = 4;
const STATUS_ERROR = 5;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export class Action {
  constructor(command, device, options = {}) {
    this.device = device;
    this.currentTimeout = undefined;
    this.command = command;
    this.timeout = options.timeout ?? 1000;
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
      this.status = STATUS_ERROR;
      this.reject(`Timeout, waiting over ${this.timeout}ms`);
      this.logger?.error(`Timeout, waiting over ${this.timeout}ms`);
    }, this.timeout);
  }

  async writeRead() {
    this.startTimestamp = Date.now();
    this.status = STATUS_COMMAND_SENT;
    await this.setTimeout();
    this.writeText(this.command)
      .then(async () => {
        const response = await this.readText();
        this.status = STATUS_ANSWER_RECEIVED;
        this.answer = this.endCommandAnswerCallback(this.command, response);
      })
      .then(() => {
        this.status = STATUS_RESOLVED;
        this.resolve(this.answer);
      });
    return this.promise;
  }

  async writeText(command) {
    const dataArrayBuffer = encoder.encode(`${command}\n`);
    return this.device.writer.write(dataArrayBuffer);
  }

  async readText() {
    let result = '';
    this.status = STATUS_ANSWER_PARTIALLY_RECEIVED;
    while (this.status === STATUS_ANSWER_PARTIALLY_RECEIVED) {
      const chunk = await this.device.reader.read();
      result += decoder.decode(chunk.value);
      this.partialAnswer = result;
      if (this.isEndCommandAnswer(this.command, result)) break;
      await delay(1);
    }
    return result;
  }
}
