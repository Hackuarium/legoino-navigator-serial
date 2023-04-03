const state = LegoinoSerial.GRBL.getEmptyState();

const terminal = new LegoinoSerial.Terminal({
  onChange: (newEvents, allEvents) => {
    document.getElementById('terminal').innerHTML = terminal.toHtml();
  },
  //ignoreSend: [/\?/],
  // ignoreReceive: [/^(ok|<)/],
  showSpecial: false,
});

const devicesManager = new LegoinoSerial.DevicesManager(navigator.serial, {
  logger,
  terminal,
  portFilter: [
    { usbProductId: 67, usbVendorId: 9025 }, // arduino uno
    { usbProductId: 37384, usbVendorId: 6991 },
    { usbProductId: 60000, usbVendorId: 4292 },
  ],
  command: {
    isEndCommandAnswer: (command, answer) => {
      return answer.match(/ok([.\r]*)\n/gm) || answer.match(/error: (.*)\n/);
    },
    endCommandAnswerCallback: (command, answer) => {
      return answer;
    },
  },
  device: {
    interCommandDelay: 50,
    timeout: 1000,
  },
});

async function doAll() {
  await devicesManager.updateDevices();
  let devices = devicesManager.getDevicesList();

  devicesManager.continuousUpdateDevices({
    callback: (devices) => {
      const table = devicesToTable(devices);
      document.getElementById('devices').innerHTML = table;
    },
  });

  // monitoring the state
  window.setTimeout(() => {
    window.setInterval(async () => {
      await sendCommand('?', { disableTerminal: true, unique: true });
    }, 250);
  }, 1000);

  // checking if anything is coming just like that
  if (false) {
    window.setInterval(async () => {
      const result = await sendCommand('', {
        timeout: 20,
        timeoutResolve: true,
      });
    }, 2000);
  }

  window.setTimeout(async () => {
    await sendCommand('$$');
  }, 500000);
}

doAll();

async function sendCommand(command, options = {}) {
  await devicesManager
    .sendCommand('9025-67', command, options)
    .then((result) => {
      LegoinoSerial.GRBL.updateState(result, state);
    })
    .catch((e) => {
      LegoinoSerial.GRBL.updateState(e, state);
    });
  updateScreen();
}

async function copySettings() {
  await devicesManager
    .sendCommand('9025-67', '$$')
    .then((result) => {
      navigator.clipboard.writeText(result.replace('ok', ''));
    })
    .catch((e) => {});
}

async function sendGcode(text) {
  for (let command of text.split(/\r?\n/).filter((line) => line)) {
    if (command.match(/^\$/)) {
      sendCommand(command);
    } else {
      const sentLine = state.gcode.sentLine++;
      await sendCommand(`N${sentLine} ${command}`);
      while (state.status.Ln?.[0] && sentLine - state.status.Ln?.[0] > 10) {
        // 10 steps in advance
        await delay(100);
      }
    }
  }
}

async function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve();
    }, ms);
  });
}

function updateScreen() {
  document.getElementById('messages').innerHTML = `<div>${state.messages
    .map((message) => {
      const style = message.kind.match(/(error|alarm)/i)
        ? 'color: red; font-weight: bold'
        : '';
      let line = `<div style="${style}">${message.kind}: ${message.description}</div>`;

      return line;
    })
    .join('\n')}</div>`;

  const pinStates = state.status.Pn?.map((pinState, pinIndex) => {
    const pinName = state.settings[`$P${pinIndex}`]?.description;
    return `<span style="color: white; padding: 2px; margin: 2px; border: solid 1px; background-color: ${
      pinState ? 'red' : 'green'
    }">${String.fromCharCode(88 + pinIndex)}: ${pinState}</span>`;
  }).join('\n');

  const stateColor = state.status.value.match(/(idle)/i)
    ? 'lightgreen'
    : state.status.value.match(/(run)/i)
    ? 'green'
    : 'pink';
  document.getElementById('state').innerHTML = `
  <div style="background-color: ${stateColor}">
   
      <div style="font-size: 2em; text-align: center; font-weight: bold">${state.status.value}</div>
      <div style="font-size: 1.5em; font-weight: bold">X: ${state.status?.MPos?.[0]}</div>
      <div style="font-size: 1.5em; font-weight: bold">Y: ${state.status?.MPos?.[1]}</div>
      <div style="font-size: 1.5em; font-weight: bold">Z: ${state.status?.MPos?.[2]}</div>
      Pin states: ${pinStates}<br/>
      Feed rate: ${state.status.FS?.[0]}<br/> 
      Spindle rate: ${state.status.FS?.[1]}<br/>
      GCode line number: ${state.status.Ln?.[0]}<br/>
      Override Values: ${state.status.Ov}<br/>
      Work Coordinate Offset: ${state.status.WCO}<br/>
      </div>
   `;

  document.getElementById('settings').innerHTML = `
      <table>
        <tr>
          <th>Key</th>
          <th>Value</th>
          <th>Description</th>
        </tr>
        ${Object.keys(state.settings)
          .sort((a, b) => Number(a.substring(1)) - Number(b.substring(1)))
          .map((key) => state.settings[key])
          .map(
            (setting) =>
              `
        <tr>
          <td>${setting.key}</td>
          <td>${setting.value}</td>
          <td>${setting.description}</td>
          </tr>
        `,
          )
          .join('')}
      </table>
`;

  document.getElementById('parameters').innerHTML = `
<table>
  <tr>
    <th>Key</th>
    <th>Value</th>
    <th>Description</th>
  </tr>
  ${Object.keys(state.parameters)
    .sort()
    .map((key) => state.parameters[key])
    .map(
      (parameter) =>
        `
  <tr>
    <td>${parameter.key}</td>
    <td>${parameter.value}</td>
    <td>${parameter.description}</td>
    </tr>
  `,
    )
    .join('')}
</table>
`;
}
