const ipp = require('ipp');

const printer = ipp.Printer('http://192.168.1.37:631/ipp/printer');

const msg = {
  'operation-attributes-tag': {
    'requesting-user-name': 'Diagnostics',
    'requested-attributes': [
      'printer-name',
      'printer-state',
      'printer-state-reasons',
      'printer-state-message',
      'document-format-supported',
      'operations-supported',
      'media-supported',
      'media-ready',
      'printer-make-and-model',
      'ipp-versions-supported',
      'pdl-override-supported',
      'color-supported',
      'pages-per-minute',
      'printer-is-accepting-jobs',
      'queued-job-count'
    ]
  }
};

printer.execute('Get-Printer-Attributes', msg, (err, res) => {
  if (err) {
    console.error('IPP Error:', err);
    process.exit(1);
  }
  console.log('IPP Response Status:', res.statusCode);
  console.log('Printer Attributes:');
  console.log(JSON.stringify(res['printer-attributes-tag'], null, 2));
});
