const ipp = require('ipp');

const printer = ipp.Printer('http://192.168.1.37:631/ipp/printer');

printer.execute('Get-Printer-Attributes', null, (err, res) => {
  if (err) return console.error(err);
  const attrs = res['printer-attributes-tag'];
  for (const [k, v] of Object.entries(attrs)) {
    if (k.includes('urf')) {
      console.log(`${k}:`, JSON.stringify(v));
    }
  }
});
