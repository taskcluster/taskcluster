const fs = require('fs');
const config = require('typed-env-config');
const Listr = require('listr');
const Observable = require('zen-observable');
const {spawn} = require('child_process');

const main = async () => {
  const cfg = config({
    files: ['services.yml', 'user-config.yml'],
    profile: 'default',
  });
  const lockFile = JSON.parse(fs.readFileSync('services.lock'));

  const publisher = new Listr(
    Object.keys(lockFile).map(serviceName => {
      const service = Object.assign({}, {name: serviceName}, lockFile[serviceName]);
      return {
        title: service.name,
        task: () => new Listr([
          {
            title: 'Docker push',
            task: async () => {
              const cmd = spawn('docker', ['push', service.tag]);
              return new Observable(observer => {
                observer.next('waiting...');
                cmd.on('error', observer.error);
                cmd.on('close', observer.complete);
                cmd.stdout.on('data', observer.next);
                cmd.stderr.on('data', observer.next);
              });
            },
          }
        ])
      };
    }),
    {concurrent: 1}
  );

  await publisher.run();
};

main().catch(console.error);
