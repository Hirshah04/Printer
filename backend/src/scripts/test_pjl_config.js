const net = require('net');

const client = new net.Socket();

client.connect(9100, '192.168.1.37', () => {
  console.log('Connected to 192.168.1.37:9100');
  const pjlQuery = '\x1b%-12345X@PJL \r\n@PJL INFO CONFIG\r\n@PJL INFO VARIABLES\r\n\x1b%-12345X';
  client.write(pjlQuery);
});

client.on('data', (data) => {
  console.log(data.toString());
  client.destroy();
});

client.on('error', (err) => console.error(err));
setTimeout(() => client.destroy(), 4000);
