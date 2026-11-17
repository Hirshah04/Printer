const net = require('net');

const client = new net.Socket();

client.connect(9100, '192.168.1.37', () => {
  console.log('Connected to 192.168.1.37:9100 (RAW / JetDirect)!');
  const pjlQuery = '\x1b%-12345X@PJL \r\n@PJL INFO STATUS\r\n\x1b%-12345X';
  client.write(pjlQuery);
});

client.on('data', (data) => {
  console.log('Received PJL response from printer:');
  console.log(data.toString());
  client.destroy();
});

client.on('error', (err) => {
  console.error('Socket error:', err);
});

client.on('close', () => {
  console.log('Connection closed');
});

setTimeout(() => {
  console.log('Timeout waiting for PJL response');
  client.destroy();
}, 5000);
