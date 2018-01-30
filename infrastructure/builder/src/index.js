const fs = require('fs');
const config = require('typed-env-config');
const ON_DEATH = require('death');
const Listr = require('listr');
const Steps = require('./steps');

// This is being used a shell trap
//const CLEAN_STEPS = [];
//ON_DEATH((signal, err) => {
//  CLEAN_STEPS.forEach(step => {
//    step();
//  });
//  err && console.error(err);
//  process.exit(signal);
//});

const main = async () => {
  const cfg = config({
    files: ['services.yml'],
  });

  const imageBuilder = new Listr(
    cfg.services.map(service => {
      const steps = new Steps(service, cfg);
      return {
        title: service.name,
        task: () => new Listr([
          {
            title: 'Clone service repo',
            task: (ctx) => steps.clone(ctx),
          },
          {
            title: 'Gather build configuration',
            task: () => steps.readConfig(),
          },
          {
            title: 'Clone buildpack repo',
            task: () => steps.cloneBuildpack(),
          },
          {
            title: 'Detect',
            task: () => steps.detect(),
          },
          {
            title: 'Compile',
            task: () => steps.compile(),
          },
          {
            title: 'Generate entrypoint',
            task: () => steps.entrypoint(),
          },
          {
            title: 'Build image',
            task: (ctx) => steps.buildFinalImage(ctx),
          },
          {
            title: 'Clean',
            task: () => steps.cleanup(),
          },
        ])
      };
    }),
    {concurrent: 1}
  );

  const results = await imageBuilder.run();
  fs.writeFileSync('services.lock', JSON.stringify(results, null, 4));
};

main().catch(console.error);
