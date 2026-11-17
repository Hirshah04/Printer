const ipp = require('ipp');

const printer = ipp.Printer('http://192.168.1.37:631/ipp/printer');

const msg = {
  'operation-attributes-tag': {
    'requesting-user-name': 'Diagnostics',
    'job-id': 421
  }
};

printer.execute('Get-Job-Attributes', msg, (err, res) => {
  if (err) {
    console.error('IPP Error:', err);
    process.exit(1);
  }
  console.log('IPP Response Status:', res.statusCode);
  console.log('Job 421 Attributes:', JSON.stringify(res['job-attributes-tag'], null, 2));
});
