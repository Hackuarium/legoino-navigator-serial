/**
 * fifo-logger - Simple event logger for the browser and node.js
 * @version v0.5.2
 * @link https://github.com/cheminfo/fifo-logger#readme
 * @license MIT
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined'
    ? factory(exports)
    : typeof define === 'function' && define.amd
    ? define(['exports'], factory)
    : ((global =
        typeof globalThis !== 'undefined' ? globalThis : global || self),
      factory((global.FifoLogger = {})));
})(this, function (exports) {
  let IDX = 256;
  let HEX = [];
  let BUFFER;
  while (IDX--) HEX[IDX] = (IDX + 256).toString(16).substring(1);

  function v4() {
    let i = 0;
    let num;
    let out = '';
    if (!BUFFER || IDX + 16 > 256) {
      BUFFER = Array((i = 256));
      while (i--) BUFFER[i] = (256 * Math.random()) | 0;
      i = IDX = 0;
    }
    for (; i < 16; i++) {
      num = BUFFER[IDX + i];
      if (i == 6) out += HEX[(num & 15) | 64];
      else if (i == 8) out += HEX[(num & 63) | 128];
      else out += HEX[num];
      if (i & 1 && i > 1 && i < 11) out += '-';
    }
    IDX++;
    return out;
  }

  const levels = {
    values: {
      fatal: 60,
      error: 50,
      warn: 40,
      info: 30,
      debug: 20,
      trace: 10,
      silent: 0,
    },
    labels: {
      0: 'silent',
      10: 'trace',
      20: 'debug',
      30: 'info',
      40: 'warn',
      50: 'error',
      60: 'fatal',
    },
  };

  /**
   * A FIFO logger that stores the last events in an array.
   */
  class FifoLogger {
    constructor() {
      let options =
        arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      this.initialOptions = options;
      this.uuids = [v4()];
      this.events = [];
      this.level = options.level || 'info';
      this.levelAsNumber = levels.values[this.level];
      this.limit = options.limit ?? 1000;
      this.bindings = options.bindings ?? {};
      this.onChange = options.onChange;
    }
    setLevel(level) {
      this.level = level;
      this.levelAsNumber = levels.values[level];
    }
    setLimit(limit) {
      this.limit = limit;
      this.checkSize();
    }
    checkSize() {
      if (this.events.length > this.limit) {
        this.events.splice(0, this.events.length - this.limit);
      }
    }
    /**
     * Remove events from the current logger and its children.
     * @param options
     */
    clear() {
      for (let i = this.events.length - 1; i >= 0; i--) {
        if (this.events[i].uuids.includes(this.uuids[0])) {
          this.events.splice(i, 1);
        }
      }
      this.onChange?.(undefined, this.events, {
        depth: this.uuids.length,
      });
    }
    getLogs() {
      let options =
        arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      const { level, minLevel, includeChildren } = options;
      let logs = this.events.slice();
      if (includeChildren) {
        logs = logs.filter((log) => log.uuids.includes(this.uuids[0]));
      } else {
        logs = logs.filter((log) => log.uuids[0] === this.uuids[0]);
      }
      if (level) {
        const levelNumber = Number(levels.values[level]);
        if (Number.isNaN(levelNumber)) {
          throw new Error('Invalid level');
        }
        logs = logs.filter((log) => log.level === levelNumber);
      }
      if (minLevel) {
        const levelNumber = Number(levels.values[minLevel]);
        if (Number.isNaN(levelNumber)) {
          throw new Error('Invalid level');
        }
        logs = logs.filter((log) => log.level >= levelNumber);
      }
      return logs;
    }
    /**
     * @param bindings: an object of key-value pairs to include in log lines as properties.
     * @param options: an options object that will override child logger inherited options.
     */
    child(bindings) {
      const newFifoLogger = new FifoLogger(this.initialOptions);
      newFifoLogger.events = this.events;
      newFifoLogger.uuids = [v4(), ...this.uuids];
      newFifoLogger.bindings = {
        ...this.bindings,
        ...bindings,
      };
      return newFifoLogger;
    }
    trace(value, message) {
      addEvent(this, levels.values.trace, value, message);
    }
    debug(value, message) {
      addEvent(this, levels.values.debug, value, message);
    }
    info(value, message) {
      addEvent(this, levels.values.info, value, message);
    }
    warn(value, message) {
      addEvent(this, levels.values.warn, value, message);
    }
    error(value, message) {
      addEvent(this, levels.values.error, value, message);
    }
    fatal(value, message) {
      addEvent(this, levels.values.fatal, value, message);
    }
  }

  function addEvent(logger, level, value, message) {
    if (level < logger.levelAsNumber) return;
    const event = {
      level,
      levelLabel: levels.labels[level],
      time: Date.now(),
      uuids: logger.uuids,
    };
    if (value instanceof Error) {
      event.message = value.toString();
      event.error = value;
      event.meta = {
        ...logger.bindings,
      };
    } else if (message && typeof value === 'object') {
      event.message = message;
      event.meta = {
        ...logger.bindings,
        ...value,
      };
    } else if (!message && typeof value === 'string') {
      event.message = value;
      event.meta = {
        ...logger.bindings,
      };
    } else {
      throw new Error('Invalid arguments');
    }
    logger.events.push(event);
    logger.checkSize();
    if (logger.onChange) {
      logger.onChange(event, logger.events, {
        depth: logger.uuids.length,
      });
    }
  }

  exports.FifoLogger = FifoLogger;

  Object.defineProperty(exports, '__esModule', { value: true });
});
//# sourceMappingURL=fifo-logger.js.map
