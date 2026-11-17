const ipp = require('ipp');

const printer = ipp.Printer('http://192.168.1.37:631/ipp/printer');

printer.execute('Get-Printer-Attributes', {
  'operation-attributes-tag': {
    'requesting-user-name': 'Diagnostics',
    'requested-attributes': [
      'media-default',
      'media-ready',
      'media-col-default',
      'print-quality-default',
      'orientation-requested-default',
      'sides-default',
      'pdl-override-supported'
    ]
  }
}, (err, res) => {
  if (err) console.error(err);
  else console.log(JSON.stringify(res['printer-attributes-tag'], null, 2));
});
