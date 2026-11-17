const ipp = require('ipp');
const fs = require('fs');

const printer = ipp.Printer('http://192.168.1.37:631/ipp/printer');
const pclmData = fs.readFileSync('test_direct.pclm');

console.log(`Submitting 600 DPI test_direct.pclm (${pclmData.length} bytes)...`);

const msg = {
  'operation-attributes-tag': {
    'requesting-user-name': 'DirectWiFi',
    'job-name': 'TestDirect600DPI.pdf',
    'document-format': 'application/PCLm'
  },
  'job-attributes-tag': {
    'copies': 1,
    'media': 'iso_a4_210x297mm'
  },
  data: pclmData
};

printer.execute('Print-Job', msg, (err, res) => {
  if (err) return console.error('Error submitting job:', err);
  console.log('Submission Result:', res.statusCode);
  console.log('Job attributes:', JSON.stringify(res['job-attributes-tag'], null, 2));
});
