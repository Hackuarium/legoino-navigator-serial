import { readFileSync } from 'fs';

const lines = readFileSync(
  new URL('boards.txt', import.meta.url),
  'utf8',
).split(/\r?\n/);

const results = [];
let boardName = '';
let usbVendorId = 0;
let usbProductId = 0;

for (let line of lines) {
  if (line.includes('.name')) {
    boardName = line.split('=')[1];
  }
  if (line.includes('.vid.')) {
    usbVendorId = Number(line.split('=')[1]);
  }
  if (line.includes('.pid.')) {
    usbProductId = Number(line.split('=')[1]);
    results.push({
      boardName,
      usbVendorId,
      usbProductId,
    });
  }
}
