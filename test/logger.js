const logger = new FifoLogger.FifoLogger({
  onChange: (log, logs) => {
    const allLogs = logger.getLogs({ includeChildren: true, level: 'warn' });
    document.getElementById('logs').innerHTML = `<table><tr>
        <th>Kind</th>
        <th>usbVendorId</th>
        <th>usbProductId</th>
        <th>command</th>
        <th>Level</th>
        <th>Message</th>
      </tr>${allLogs
        .map((log) => {
          return `<tr>
          <td>${log.meta?.kind || ''}</td>
          <td>${log.meta?.usbVendorId || ''}</td>
          <td>${log.meta?.usbProductId || ''}</td>
          <td>${log.meta?.command || ''}</td>
          <td>${log.levelLabel}</td>
          <td>${log.message}</td>
        </tr>`;
        })
        .join('')}</table>`;
  },
});
