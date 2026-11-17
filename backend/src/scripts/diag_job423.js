const ipp = require('ipp');

const printer = ipp.Printer('http://192.168.1.37:631/ipp/printer');

const msg = {
  'operation-attributes-tag': {
    'requesting-user-name': 'Diagnostics',
    'job-id': 423
  }
};

printer.execute('Get-Job-Attributes', msg, (err, res) => {
  if (err) {
    console.error('IPP Error:', err);
    process.exit(1);
  }
  console.log('Job 423 Status:', res.statusCode);
  console.log('Attributes:', JSON.stringify(res['job-attributes-tag'], null, 2));
});
