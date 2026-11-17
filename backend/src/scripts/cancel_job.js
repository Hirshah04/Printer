const ipp = require('ipp');

const printer = ipp.Printer('http://192.168.1.37:631/ipp/printer');

const msg = {
  'operation-attributes-tag': {
    'requesting-user-name': 'DirectWi-FiTest',
    'job-id': 423
  }
};

printer.execute('Cancel-Job', msg, (err, res) => {
  if (err) {
    console.error('Cancel-Job Error:', err);
    process.exit(1);
  }
  console.log('Cancel-Job Response Status:', res.statusCode);
  console.log(JSON.stringify(res, null, 2));
});
