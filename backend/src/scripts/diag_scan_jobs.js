const ipp = require('ipp');

const printer = ipp.Printer('http://192.168.1.37:631/ipp/printer');

async function checkJobs() {
  for (let id = 415; id <= 425; id++) {
    await new Promise((resolve) => {
      printer.execute('Get-Job-Attributes', {
        'operation-attributes-tag': {
          'requesting-user-name': 'Diagnostics',
          'job-id': id
        }
      }, (err, res) => {
        if (!err && res?.statusCode === 'successful-ok') {
          const t = res['job-attributes-tag'];
          console.log(`Job #${id}: State=${t['job-state']} Name=${t['job-name']} Sheets=${t['job-media-sheets-completed']}`);
        }
        resolve();
      });
    });
  }
}

checkJobs();
