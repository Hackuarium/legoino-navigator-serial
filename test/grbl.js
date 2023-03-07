function parse(command, input) {
  const result = checkAnswer(input);
  if (!result.ok) {
    logger.error(result.error);
  } else {
    switch (command) {
      case '?':
        return parseQuestionMark(result);
      default:
        logger.error(`Unknown command: ${command}`);
    }
  }
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
