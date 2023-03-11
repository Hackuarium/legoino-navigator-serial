import { v4 } from '@lukeed/uuid';

export class Terminal {
  constructor(options = {}) {
    this.lineNumber = 0;
    this.eventNumber = 0;
    this.limit = options.limit || 1000;
    this.onChange = options.onChange;
    this.ignoreSend = options.ignoreSend ?? [];
    this.ignoreReceive = options.ignoreReceive ?? [];
    this.showSpecial = options.showSpecial || true;
    this.sendColor = options.sendColor || '#41c5d1';
    this.receiveColor = options.receiveColor || '#2ea600';
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
        lineNumber: this.lineNumber,
        eventNumber: this.eventNumber,
        kind,
        line,
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
      html.push(
        `<div style="color: ${
          event.kind === 'send' ? this.sendColor : this.receiveColor
        }">${htmlEscape(event.line)}</div>`,
      );
    }
    html.push('</div>');
    return html.join('\n');
  }
}

function splitInLines(text, showSpecial) {
  if (showSpecial) {
    text = text
      .replace(/\r/g, '<CR>')
      .replace(/\n/g, '<LF>\n')
      .replace(/\t/g, '<TAB>\t');
  }
  return text.split(/\r?\n/);
}

function htmlEscape(str) {
  return str.replace(/&/g, '&amp').replace(/>/g, '&gt').replace(/</g, '&lt');
}
