"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const job_consumer_js_1 = require("./queue/job.consumer.js");
async function main() {
    console.log('========================================================');
    console.log('🖨️  AIRPRINT HUB - CLOUD PRINT WORKER DAEMON');
    console.log('========================================================');
    const consumer = new job_consumer_js_1.JobConsumer();
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
