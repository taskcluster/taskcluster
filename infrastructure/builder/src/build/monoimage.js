const fs = require('fs');
const path = require('path');
const tar = require('tar-fs');
const appRootDir = require('app-root-dir');
const {
  gitIsDirty,
  gitDescribe,
  dockerPull,
  dockerImages,
  dockerBuild,
  dockerRegistryCheck,
  ensureDockerImage,
  ensureTask,
  dockerPush,
} = require('../utils');

const DOCKERFILE = (nodeImage, nodeAlpineImage) => `
##
# Build /app

ARG taskcluster_version
FROM ${nodeImage} as build

RUN mkdir -p /base /base/cache
ENV YARN_CACHE_FOLDER=/base/cache

# copy the repository into the image, including the entrypoint
COPY / /base/repo

# Clone that to /app
RUN git clone --depth 1 /base/repo /base/app

# set up the /app directory
WORKDIR /base/app
RUN cp /base/repo/taskcluster-version taskcluster-version
RUN chmod +x entrypoint
RUN yarn install --frozen-lockfile

WORKDIR /base/app/ui
RUN yarn install --frozen-lockfile

# clean up some unnecessary and potentially large stuff
WORKDIR /base/app
RUN rm -rf .git
RUN rm -rf .node-gyp ui/.node-gyp
RUN rm -rf clients/client-{go,py,web}
RUN rm -rf {services,libraries}/*/test

##
# build the final image

FROM ${nodeAlpineImage} as image
RUN apk update && apk add nginx && mkdir /run/nginx && apk add bash
COPY --from=build /base/app /app
ENV HOME=/app
WORKDIR /app
ENTRYPOINT ["/app/entrypoint"]
`;

/**
 * The "monoimage" is a single docker image containing all tasks.  This build process goes
 * something like this:
 *
 *  - Clone the monorepo (from the current working copy)
 *  - Build it (install dependencies, transpile, etc.)
 *    - done in a Docker volume to avoid Docker for Mac bugs
 *  - Build the docker image containing the app (/app)
 *
 *  All of this is done using a "hooks" approach to allow segmenting the various oddball bits of
 *  this process by theme.
 */
const generateMonoimageTasks = ({tasks, baseDir, cmdOptions}) => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(appRootDir.get(), 'package.json')));
  const nodeVersion = packageJson.engines.node;

  // we need the "full" node image to build (to install buffertools, for example..)
  const nodeImage = `node:${nodeVersion}`;
  // but the alpine image can run the services..
  const nodeAlpineImage = `node:${nodeVersion}-alpine`;

  const sourceDir = appRootDir.get();

  ensureDockerImage(tasks, baseDir, nodeImage);
  ensureDockerImage(tasks, baseDir, nodeAlpineImage);

  ensureTask(tasks, {
    title: 'Build Taskcluster Docker Image',
    requires: [
      'build-can-start', // (used to delay building in `yarn release`)
      `docker-image-${nodeImage}`,
      `docker-image-${nodeAlpineImage}`,
    ],
    provides: [
      'monoimage-docker-image', // image tag
      'monoimage-image-on-registry', // true if the image is already on registry
    ],
    locks: ['git'],
    run: async (requirements, utils) => {
      utils.step({title: 'Check Repository'});

      // Clone from the current working copy, rather than anything upstream;
      // this avoids the need to land-and-push changes.  This is a git clone
      // operation instead of a raw filesystem copy so that any non-checked-in
      // files are not accidentally built into docker images.
      if (!cmdOptions.ignoreUncommittedFiles) {
        if (await gitIsDirty({dir: sourceDir})) {
          throw new Error([
            'The current git working copy is not clean. Any non-checked-in files will',
            'not be reflected in the built image, so this is treatd as an error by default.',
            'Either check in the dirty files, or run with --ignore-uncommitted-files to',
            'override this error.  Never check in files containing secrets!',
          ].join(' '));
        }
      }

      const {gitDescription} = await gitDescribe({
        dir: sourceDir,
        utils,
      });
      const tag = `taskcluster/taskcluster:${gitDescription}`;

      utils.step({title: 'Check for Existing Images'});

      const imageLocal = (await dockerImages({baseDir}))
        .some(image => image.RepoTags && image.RepoTags.indexOf(tag) !== -1);
      const imageOnRegistry = await dockerRegistryCheck({tag});

      const provides = {
        'monoimage-docker-image': tag,
        'monoimage-image-on-registry': imageOnRegistry,
      };

      if (imageOnRegistry && cmdOptions.noCache) {
        throw new Error(
          `Image ${tag} already exists on the registry, but --no-cache was given.`);
      }

      // bail out if we can, pulling the image if it's only available remotely
      if (!imageLocal && imageOnRegistry) {
        await dockerPull({image: tag, utils, baseDir});
        return utils.skip({provides});
      } else if (imageLocal) {
        return utils.skip({provides});
      }

      utils.step({title: 'Generating Input Tarball'});

      const tarball = tar.pack(sourceDir, {
        // include the repo as-is, filtering out a few large things.  The Dockerfile
        // will `git clone` this, so any other unnecessary bits will not appear in
        // the final tarball.
        entries: ['.'],
        ignore: name => (
          name.match(/\/node_modules\//) ||
          name.match(/\/user-config.yml/)
        ),
        finalize: false,
        finish: pack => {
          // include a few generated files
          pack.entry({name: "Dockerfile"}, DOCKERFILE(nodeImage, nodeAlpineImage));
          pack.entry({name: "taskcluster-version"}, gitDescription);
          pack.finalize();
        },
      });

      utils.step({title: 'Building Docker Image'});

      await dockerBuild({
        tarball: tarball,
        logfile: `${baseDir}/docker-build.log`,
        tag,
        utils,
        baseDir,
      });

      return provides;
    },
  });

  ensureTask(tasks, {
    title: `Monoimage - Push Image`,
    requires: [
      `monoimage-docker-image`,
      `monoimage-image-on-registry`,
    ],
    provides: [
      `target-monoimage`,
    ],
    run: async (requirements, utils) => {
      const tag = requirements[`monoimage-docker-image`];
      const provides = {[`target-monoimage`]: tag};

      if (!cmdOptions.push) {
        return utils.skip({provides});
      }

      if (requirements[`monoimage-image-on-registry`]) {
        return utils.skip({provides});
      }

      await dockerPush({
        logfile: `${baseDir}/docker-push.log`,
        tag,
        utils,
        baseDir,
      });

      return provides;
    },
  });
};

module.exports = generateMonoimageTasks;
