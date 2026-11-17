const ipp = require('ipp');
const fs = require('fs');

const printer = ipp.Printer('http://192.168.1.37:631/ipp/printer');
const pclmData = fs.readFileSync('test.pclm');

console.log('Sending test.pclm (size:', pclmData.length, 'bytes) to 192.168.1.37:631/ipp/printer ...');

const printMsg = {
  'operation-attributes-tag': {
    'requesting-user-name': 'DirectWi-FiTest',
    'job-name': 'DirectTestJob.pdf',
    'document-format': 'application/PCLm'
  },
  'job-attributes-tag': {
    'copies': 1,
    'media': 'iso_a4_210x297mm'
  },
  data: pclmData
};

printer.execute('Print-Job', printMsg, (err, res) => {
  if (err) {
    console.error('Submission failed with error:', err);
    process.exit(1);
  }
  console.log('Print-Job response status:', res.statusCode);
  console.log('Print-Job response:', JSON.stringify(res, null, 2));
  const jobId = res['job-attributes-tag']?.['job-id'];
  console.log('Returned Job ID:', jobId);

  // Poll printer attributes every 2s for 30s to see how printer responds
  let count = 0;
  const timer = setInterval(() => {
    count++;
    if (count > 15) {
      clearInterval(timer);
      console.log('Polling finished.');
      process.exit(0);
    }
    printer.execute('Get-Printer-Attributes', {
      'operation-attributes-tag': {
        'requesting-user-name': 'PollTest',
        'requested-attributes': ['printer-state', 'printer-state-reasons', 'printer-state-message', 'queued-job-count']
      }
    }, (err2, res2) => {
      if (err2) {
        console.log(`[${count * 2}s] Poll error:`, err2.message);
      } else {
        const tag = res2['printer-attributes-tag'];
        console.log(`[${count * 2}s] State: ${tag['printer-state']} | Reasons: ${tag['printer-state-reasons']} | Msg: ${tag['printer-state-message']} | Queued: ${tag['queued-job-count']}`);
      }
    });
  }, 2000);
});
