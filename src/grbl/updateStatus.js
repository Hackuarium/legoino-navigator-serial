import { errorsDescription } from './errorsDescription.js';
import { parametersDescription } from './parametersDescription.js';
import { settingsDescription } from './settingsDescription.js';

export function updateStatus(input, status) {
  const lines = input.split(/\r?\n/);

  for (let line of lines) {
    if (line.startsWith('<')) {
      parseQuestionMark(line, status);
    }
    if (line.startsWith('[')) {
      parseParameters(line, status);
    }
    if (line.startsWith('$')) {
      parseSettings(line, status);
    }
    if (line.startsWith('Grbl')) {
      status.version = line.replace('Grbl ', '');
    }
    if (line.startsWith('error')) {
      parseErrors(line, status);
    }
  }
}

function parseErrors(line, status) {
  const [, error] = line.split(':');
  status.error = {
    code: error,
    description: errorsDescription[error],
  };
}

function parseSettings(line, status) {
  const [key, value] = line.split('=');
  status.settings[key] = {
    key,
    description: settingsDescription[key],
    value: Number(value),
  };
}

function parseParameters(line, status) {
  const [key, value] = line.replace(/\[(.*)\]/, '$1').split(':');
  status.parameters[key] = {
    key,
    description: parametersDescription[key],
    value: value.split(',').map((field) => Number(field)),
  };
}

function parseQuestionMark(line, status) {
  //  <Idle|MPos:0.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000>
  const parts = line.replace(/<(.*)>/, '$1').split('|');
  const message = parts[0];
  const info = {};
  for (let i = 1; i < parts.length; i++) {
    const [key, value] = parts[i].split(':');
    info[key] = value.split(',').map((v) => Number(v));
  }
  status.message = message;
  status.info = { ...status.info, ...info };
}
