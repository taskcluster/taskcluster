import assert from 'assert';
import { taskDefinition } from './fixtures/task';
import artifactLinkTransform from '../lib/transform/artifact_links';

suite('artifact link transform', () => {
  test('artifact link added', async () => {
    let links = ['foo'];
    let expectedLink = {
      label: 'artifact uploaded',
      linkText: 'test.log',
      url: 'https://queue.taskcluster.net/v1/123/0/artifacts/public/test.log'
    };
    let job = {
      jobInfo: {
        links: links
      }
    };
    let queue = {
      listArtifacts: () => {
        return {artifacts: [{name: 'public/test.log'}]};
      },
      buildUrl: (client, taskId, runId, name) => {
        return `https:\/\/queue.taskcluster.net/v1/${taskId}/${runId}/artifacts/${name}`;
      }
    };

    job = await artifactLinkTransform(queue, '123', 0, job);
    links.push(expectedLink);

    assert.deepEqual(links, job.jobInfo.links);
  });

  test('artifacts with same basename', async () => {
    let expectedLinks = [
      {
        label: 'artifact uploaded',
        linkText: 'test.log',
        url: 'https://queue.taskcluster.net/v1/123/0/artifacts/public/test.log'
      },
      {
        label: 'artifact uploaded',
        linkText: 'test.log (1)',
        url: 'https://queue.taskcluster.net/v1/123/0/artifacts/public/test/test.log'
      }
    ];
    let job = {
      jobInfo: {
        links: []
      }
    };
    let queue = {
      listArtifacts: () => {
        return {
          artifacts: [
            {name: 'public/test.log'},
            {name: 'public/test/test.log'}
          ]};
      },
      buildUrl: (client, taskId, runId, name) => {
        return `https:\/\/queue.taskcluster.net/v1/${taskId}/${runId}/artifacts/${name}`;
      }
    };

    job = await artifactLinkTransform(queue, '123', 0, job);
    assert.deepEqual(expectedLinks, job.jobInfo.links);
  });

  test('artifacts with continuation token', async () => {
    let expectedLinks = [
      {
        label: 'artifact uploaded',
        linkText: 'test.log',
        url: 'https://queue.taskcluster.net/v1/123/0/artifacts/public/test.log'
      },
      {
        label: 'artifact uploaded',
        linkText: 'fatal.log',
        url: 'https://queue.taskcluster.net/v1/123/0/artifacts/public/fatal.log'
      }
    ];
    let job = {
      jobInfo: {
        links: []
      }
    };
    let attempt = 0;
    let artifacts = [
      {name: 'public/test.log'},
      {name: 'public/fatal.log'}
    ];
    let queue = {
      listArtifacts: () => {
        let artifact = [artifacts[attempt]];
        let token = attempt === 0 ? 'token' : undefined;
        attempt += 1;
        return {
          artifacts: artifact,
          continuationToken: token
        }
      },
      buildUrl: (client, taskId, runId, name) => {
        return `https:\/\/queue.taskcluster.net/v1/${taskId}/${runId}/artifacts/${name}`;
      }
    };

    job = await artifactLinkTransform(queue, '123', 0, job);
    assert.deepEqual(expectedLinks, job.jobInfo.links);
  });

  test('error retrieving artifacts', async () => {
    let links = ['foo'];
    let job = {
      jobInfo: {
        links: links
      }
    };
    let queue = {
      listArtifacts: () => { throw new Error('bad things happened') }
    };

    job = await artifactLinkTransform(queue, '123', 0, job);
    assert.deepEqual(links, job.jobInfo.links);
  });
});
