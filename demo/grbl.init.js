const status = { status: '', info: {}, settings: {} };

const terminal = new LegoinoSerial.Terminal({
  onChange: (newEvents, allEvents) => {
    document.getElementById('terminal').innerHTML = terminal.toHtml();
  },
  ignoreSend: [/\?/],
  ignoreReceive: [/^(ok|<)/],
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
    timeout: 100,
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

  // monitoring the status
  window.setInterval(async () => {
    await sendCommand('?');
  }, 250);

  // checking if anything is coming just like that
  if (false) {
    window.setInterval(async () => {
      const result = await sendCommand('', {
        timeout: 5,
        timeoutResolve: true,
      });
      console.log(result);
    }, 2000);
  }

  window.setTimeout(async () => {
    await sendCommand('$$');
  }, 500000);
}

doAll();

async function sendCommand(command, options = {}) {
  let result = await devicesManager.sendCommand('9025-67', command, options);
  const parsed = parse(command, result);
  if (command === '?') {
    status.status = parsed.status;
    status.info = { ...status.info, ...parsed.info };
    document.getElementById('status').innerHTML = `
      <h2>Status: ${status.status}</h2>
      <h3>X: ${status.info?.MPos?.[0]}</h3>
      <h3>Y: ${status.info?.MPos?.[1]}</h3>
      <h3>Z: ${status.info?.MPos?.[2]}</h3>
      FS: ${status.info.FS}<br/>
      Ov: ${status.info.Ov}<br/>
      WCO: ${status.info.Ov}<br/>
   `;
  }
  if (command === '$$') {
    document.getElementById('settings').innerHTML = `
      <table>
        <tr>
          <th>Key</th>
          <th>Value</th>
          <th>Description</th>
        </tr>
        ${parsed
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
  }
}
