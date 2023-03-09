function parse(command, input) {
  const result = checkAnswer(input);
  if (!result.ok) {
    logger.error(result.error);
  } else if (command.match(/^[GXYZ]/)) {
    return '';
  } else {
    switch (command) {
      case '?':
        return parseQuestionMark(result);
      case '$$':
        return parseSettings(result);
      default:
        logger.error(`Unknown command: ${command}`);
    }
  }
}

function parseSettings(input) {
  const settings = [];
  for (const line of input.lines.filter((line) => line.startsWith('$'))) {
    const [key, value] = line.split('=');
    settings.push({
      key,
      description: settingsInfo[key],
      value: Number(value),
    });
  }
  return settings;
}

function parseQuestionMark(input) {
  const firstLine = input.lines[0];
  //  <Idle|MPos:0.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000>
  const parts = firstLine.replace(/<(.*)>/, '$1').split('|');
  const status = parts[0];
  const info = {};
  for (let i = 1; i < parts.length; i++) {
    const [key, value] = parts[i].split(':');
    info[key] = value.split(',').map((v) => Number(v));
  }
  return { status, info };
}

function checkAnswer(input) {
  const lines = input.split(/\r?\n/).filter((line) => line);
  const lastLine = lines.at(-1);
  if (lastLine === 'ok') {
    return { lines: lines.slice(0, -1), ok: true };
  }
  if (lastLine?.startsWith('error: ')) {
    return {
      lines: lines.slice(0, -1),
      ok: false,
      error: lastLine.replace('error: ', ''),
    };
  }
  return { lines, ok: false, error: 'Unknown error' };
}

const settingsInfo = {
  $0: 'Step pulse time, microseconds',
  $1: 'Step idle delay, milliseconds',
  $2: 'Step pulse invert, mask',
  $3: 'Step direction invert, mask',
  $4: 'Invert step enable pin, boolean',
  $5: 'Invert limit pins, boolean',
  $6: 'Invert probe pin, boolean',
  $10: 'Status report options, mask',
  $11: 'Junction deviation, millimeters',
  $12: 'Arc tolerance, millimeters',
  $13: 'Report in inches, boolean',
  $20: 'Soft limits enable, boolean',
  $21: 'Hard limits enable, boolean',
  $22: 'Homing cycle enable, boolean',
  $23: 'Homing direction invert, mask',
  $24: 'Homing locate feed rate, mm/min',
  $25: 'Homing search seek rate, mm/min ',
  $26: 'Homing switch debounce delay, milliseconds',
  $27: 'Homing switch pull-off distance, millimeters',
  $30: 'Maximum spindle speed, RPM',
  $31: 'Minimum spindle speed, RPM',
  $32: 'Laser-mode enable, boolean',
  $100: 'X-axis steps per millimeter',
  $101: 'Y-axis steps per millimeter',
  $102: 'Z-axis steps per millimeter',
  $110: 'X-axis maximum rate, mm/min',
  $111: 'Y-axis maximum rate, mm/min',
  $112: 'Z-axis maximum rate, mm/min',
  $120: 'X-axis acceleration, mm/sec^2',
  $121: 'Y-axis acceleration, mm/sec^2',
  $122: 'Z-axis acceleration, mm/sec^2',
  $130: 'X-axis maximum travel, millimeters',
  $131: 'Y-axis maximum travel, millimeters',
  $132: 'Z-axis maximum travel, millimeters',
};
