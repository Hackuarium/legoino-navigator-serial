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
    this.timeout = options.timeout === undefined ? 1000 : options.timeout;
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
      lines = lines.filter((line) => line);
      this.status = STATUS_ANSWER_RECEIVED;
      this.resolve(lines.join('\n'));
      this.finished();
      this.status = STATUS_RESOLVED;
    }
  }
}
