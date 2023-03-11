import { Terminal } from '../Terminal.js';

describe('Terminal', () => {
  it('default parameters', () => {
    const terminal = new Terminal();
    terminal.send('abc\r\ndef');
    terminal.receive('def\nghi');
    expect(terminal.events).toHaveLength(4);
  });

  it('custom parameters', () => {
    const terminal = new Terminal({ limit: 2 });
    terminal.send('abc\r\ndef');
    terminal.receive('def\nghi');
    expect(terminal.events).toHaveLength(2);
  });

  it('onChange', () => {
    const results = { newEvents: [], allEvents: [] };
    const terminal = new Terminal({
      onChange: (newEvents, allEvents) => {
        results.newEvents.push(newEvents.length);
        results.allEvents.push(allEvents.length);
      },
    });
    terminal.send('abc\r\ndef');
    terminal.receive('def\nghi');
    expect(terminal.events).toHaveLength(4);
    expect(results).toStrictEqual({ newEvents: [2, 2], allEvents: [2, 4] });
  });
});
