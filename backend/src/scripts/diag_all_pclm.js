const ipp = require('ipp');

const printer = ipp.Printer('http://192.168.1.37:631/ipp/printer');

printer.execute('Get-Printer-Attributes', null, (err, res) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  const attrs = res['printer-attributes-tag'];
  const keys = Object.keys(attrs);
  console.log('Total attributes:', keys.length);
  for (const k of keys) {
    if (k.includes('pclm') || k.includes('format') || k.includes('compression') || k.includes('strip') || k.includes('resolution')) {
      console.log(`${k}:`, JSON.stringify(attrs[k]));
    }
  }
});
