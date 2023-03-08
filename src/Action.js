const STATUS_CREATED = 0;
const STATUS_COMMAND_SENT = 1;
const STATUS_ANSWER_PARTIALLY_RECEIVED = 2;
const STATUS_ANSWER_RECEIVED = 3;
const STATUS_RESOLVED = 4;
const STATUS_ERROR = 5;

export class Action {
  constructor(command, options = {}) {
    this.currentTimeout = undefined;
    this.command = command;
    this.timeout = options.timeout ?? 1000;
    this.answer = '';
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
    console.log({ currentTimeout: this.currentTimeout, timeout: this.timeout });
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
    }
    this.currentTimeout = setTimeout(() => {
      console.log(this.status);
      if (this.status === STATUS_RESOLVED || this.status === STATUS_ERROR) {
        return;
      }
      this.status = STATUS_ERROR;
      this.reject(`Timeout, waiting over ${this.timeout}ms`);
      this.logger?.error(`Timeout, waiting over ${this.timeout}ms`);
    }, this.timeout);
  }

  async writeRead(device) {
    this.startTimestamp = Date.now();
    this.status = STATUS_COMMAND_SENT;
    this.setTimeout();
    console.log('write');
    device
      .write(`${this.command}`)
      .then(() => {
        console.log('read');
        return device.read(this);
      })
      .then(() => {
        this.resolve('ok');
      });
    return this.promise;
  }

  appendAnswer(buffer) {
    let string = new TextDecoder().decode(buffer);
    this.status = STATUS_ANSWER_PARTIALLY_RECEIVED;
    this.answer += string.replace(/\r/g, '');
    if (!this.isEndCommandAnswer(this.command, this.answer)) return;
    // end of command
    this.status = STATUS_ANSWER_RECEIVED;
    this.resolve(this.endCommandAnswerCallback(this.command, this.answer));
    this.status = STATUS_RESOLVED;
    this.logger?.info(`Action resolved with: ${this.answer.substring(0, 20)}`);
  }
}
