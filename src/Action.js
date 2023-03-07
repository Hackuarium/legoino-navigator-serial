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
    this.status = STATUS_CREATED;
    this.creationTimestamp = Date.now();
    this.promise = new Promise((resolve, reject) => {
      this.reject = reject;
      this.resolve = resolve;
    });
    this.finishedPromise = new Promise((resolve) => {
      this.finished = resolve;
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
    this.answer += string.replace(/\r/g, '');
    console.log(this.answer);
    if (!this.isEndCommandAnswer(this.command, this.answer)) return;
    // end of command
    this.status = STATUS_ANSWER_RECEIVED;
    this.resolve(this.endCommandAnswerCallback(this.command, this.answer));
    this.finished();
    this.status = STATUS_RESOLVED;
  }
}
