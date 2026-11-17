const net = require('net');
const fs = require('fs');

const pclmData = fs.readFileSync('test_direct.pclm');
console.log(`Loaded test_direct.pclm: ${pclmData.length} bytes`);

const client = new net.Socket();

client.connect(9100, '192.168.1.37', () => {
  console.log('Connected to 192.168.1.37:9100 (HP JetDirect RAW)...');

  const pjlHeader = Buffer.from(
    '\x1b%-12345X@PJL\r\n' +
    '@PJL SET JOBNAME = "Direct Wi-Fi Test"\r\n' +
    '@PJL SET QTY = 1\r\n' +
    '@PJL SET PAPER = A4\r\n' +
    '@PJL ENTER LANGUAGE = PCLm\r\n',
    'ascii'
  );

  const pjlFooter = Buffer.from('\r\n\x1b%-12345X', 'ascii');

  const fullPayload = Buffer.concat([pjlHeader, pclmData, pjlFooter]);
  console.log(`Sending full PJL stream: ${fullPayload.length} bytes...`);

  client.write(fullPayload, () => {
    console.log('Finished streaming to printer port 9100. Closing socket.');
    client.end();
  });
});

client.on('error', (err) => {
  console.error('Socket error:', err);
});

client.on('close', () => {
  console.log('Connection to port 9100 closed.');
});
