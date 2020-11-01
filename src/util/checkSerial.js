/* eslint-disable no-console */
export default function checkSerial(serial) {
  if (!serial) {
    console.error(
      "Web serial doesn't seem to be enabled in your browser. Try enabling it by visiting:",
    );
    console.error('chrome://flags/#enable-experimental-web-platform-features');
    console.error('opera://flags/#enable-experimental-web-platform-features');
    console.error('edge://flags/#enable-experimental-web-platform-features');
  }
}
