const fs = require('fs');
const config = require('typed-env-config');
const Listr = require('listr');
const Docker = require('dockerode');

const main = async () => {
  const cfg = config({
    files: ['services.yml', 'user-config.yml'],
    profile: 'default',
  });
  const lockFile = JSON.parse(fs.readFileSync('services.lock'));

  const docker = new Docker();

  const publisher = new Listr(
    Object.keys(lockFile).map(serviceName => {
      const service = Object.assign({}, {name: serviceName}, lockFile[serviceName]);
      return {
        title: service.name,
        task: () => new Listr([
          {
            title: 'Docker push',
            task: async () => {
              const image = await docker.getImage(service.image);
              await image.tag({
                repo: cfg.docker.org + '\/' + service.name,
              })
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
