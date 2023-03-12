import { alarmsDescription } from './alarmsDescription.js';
import { errorsDescription } from './errorsDescription.js';
import { parametersDescription } from './parametersDescription.js';
import { settingsDescription } from './settingsDescription.js';

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
export function updateState(input, state = {}) {
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
  appendMessage(
    {
      kind: 'ERROR',
      code: error,
      description: errorsDescription[error],
    },
    state,
  );
}

/**
 *
 * @param {string} line
 * @param {State} [state={}]
 * @returns
 */
function parseAlarms(line, state) {
  const [, alarm] = line.split(':');
  appendMessage(
    {
      kind: 'ALARM',
      code: alarm,
      description: alarmsDescription[alarm],
    },
    state,
  );
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
    value: Number(value),
  };
}

const keyMappings = {
  HLP: 'Help',
  MSG: 'Message',
  GC: 'GCode',
  VER: 'Version',
  OPT: 'Option',
  echo: 'Echo',
};

/**
 *
 * @param {string} line
 * @param {State} [state={}]
 * @returns
 */
function parseSquareBracket(line, state = {}) {
  const [key, value] = line.replace(/\[(.*)\]/, '$1').split(':');
  const description = line
    .replace(/\[(.*)\]/, '$1')
    .split(':')
    .slice(1)
    .join(':');
  switch (key) {
    case 'echo':
    case 'VER':
    case 'OPT':
    case 'HLP':
    case 'GC':
    case 'MSG':
      appendMessage({ kind: keyMappings[key], description }, state);
      return;
    default:
      state.parameters[key] = {
        key,
        description: parametersDescription[key],
        value: value.split(',').map((field) => Number(field)),
      };
  }
}

/**
 *
 * @param {string} line
 * @param {State} [state]
 * @returns
 */
function parseQuestionMark(line, state = {}) {
  //  <Idle|MPos:0.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000>
  const parts = line.replace(/<(.*)>/, '$1').split('|');
  const status = { value: parts[0] };
  status.Pn = [false, false, false];
  for (let i = 1; i < parts.length; i++) {
    const [key, value] = parts[i].split(':');

    if (key === 'Pn') {
      status[key] = [
        value.includes('X'),
        value.includes('Y'),
        value.includes('Z'),
      ];
    } else {
      status[key] = value.split(',').map((v) => Number(v));
    }
  }
  state.status = { ...state.status, ...status };
}

function appendMessage(message, state) {
  state.messages.push({
    epoch: Date.now(),
    ...message,
  });
  if (state.messages.length > MAX_ERRORS_MESSAGES) {
    state.messages.splice(0, state.messages.length - MAX_ERRORS_MESSAGES);
  }
  console.log(state.messages);
}
