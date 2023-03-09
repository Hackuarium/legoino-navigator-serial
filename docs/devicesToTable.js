function devicesToTable(devices) {
  const fields = {
    id: true,
    statusLabel: true,
    usbProductId: true,
    usbVendorId: true,
  };
  let result = '<table border="1">';
  result += `<tr>${Object.keys(fields).map(
    (field) => `<th>${field}</th>`,
  )}</tr>`;
  for (let device of devices) {
    result += '<tr>';
    for (let key of Object.keys(fields)) {
      result += `<td>${device[key]}</td>`;
    }
    result += '</tr>';
  }
  result += '</table>';
  return result;
}
