import { updateState } from './updateState.js';

function getEmptyState() {
  return {
    messages: [],
    status: {},
    settings: {},
    parameters: {},
    version: '',
    gcode: {
      currentLine: 0,
      sentLine: 1,
    },
  };
}

export const GRBL = {
  updateState,
  getEmptyState,
};
