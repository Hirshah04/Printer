import http from 'http';
import { JobConsumer } from './queue/job.consumer.js';

async function main() {
  console.log('========================================================');
  console.log('🖨️  AIRPRINT HUB - CLOUD PRINT WORKER DAEMON');
  console.log('========================================================');

  // If deployed as a Web Service on platforms like Render, bind to $PORT
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
  if (port) {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', worker: 'active' }));
    });
    server.listen(port, '0.0.0.0', () => {
      console.log(`[Worker] Health check port bound to ${port} for cloud platform.`);
    });
  }

  const consumer = new JobConsumer();
  await consumer.start();

  process.on('SIGINT', () => {
    console.log('\n[Worker] Gracefully shutting down worker...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[Worker] Termination signal received...');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Worker] Fatal Error:', err);
  process.exit(1);
});
