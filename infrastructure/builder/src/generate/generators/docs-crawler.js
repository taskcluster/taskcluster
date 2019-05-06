const Apify = require('apify');
const { promisify } = require('util');
const { join } = require('path');
const { sortBy, prop } = require('ramda');
const { REPO_ROOT, writeJSON, readdir, readJSON } = require('../util');

const rimraf = promisify(require('rimraf'));
const GENERATED = 'generated';
const APIFY_STORAGE = 'apify_storage';
const TEMP_STORAGE_PATH = join(GENERATED, APIFY_STORAGE, 'datasets', 'default');
// Ignore links outside the <main> element
const PAGE_CONTENT_SELECTOR = 'main';
// Select relative links only
const LINK_SELECTOR = `${PAGE_CONTENT_SELECTOR} a[href^="/"]`;

async function apifyCrawler({ url }) {
  // Apify.openRequestQueue() is a factory to get a preconfigured RequestQueue instance.
  // We add our first request to it - the initial page the crawler will visit.
  const requestQueue = await Apify.openRequestQueue();
  await requestQueue.addRequest({ url });
  // Create an instance of the PuppeteerCrawler class - a crawler
  // that automatically loads the URLs in headless Chrome / Puppeteer.
  return new Apify.PuppeteerCrawler({
    requestQueue,

    // Options that are passed to the Apify.launchPuppeteer() function.
    launchPuppeteerOptions: { headless: true },

    // The number of Requests the crawler should process
    // 1000 should be enough...
    maxRequestsPerCrawl: 1000,

    // This function will be called for each URL to crawl.
    // Here you can write the Puppeteer scripts you are familiar with,
    // with the exception that browsers and pages are automatically managed by the Apify SDK.
    // The function accepts a single parameter, which is an object with the following fields:
    // - request: an instance of the Request class with information such as URL and HTTP method
    // - page: Puppeteer's Page object (see https://pptr.dev/#show=api-class-page)
    handlePageFunction: async ({ request, page }) => {
      // A function to be evaluated by Puppeteer within the browser context.
      const pageFunction = (posts) => {
        const data = [];

        posts.forEach((post) => {
          const makeData = (type) => {
            const pageTitleElement = post.querySelector('h1');
            const title = pageTitleElement && pageTitleElement.innerText.trim();
            const links = Array.from(post.querySelectorAll(`${type} .anchor-link-style`));

            return links
              .map(link => {
                const { parentElement } = link;
                const content = parentElement && parentElement.innerText.trim();
                const href = link && link.href;

                if (!content || !href) {
                  return null;
                }

                return {
                  title,
                  type,
                  content,
                  href,
                };
              })
              .filter(Boolean);
          };

          // Extract headers
          // For each header, grab the page title and its link
          const result = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(makeData).flat();

          if (result.length) {
            data.push(result);
          }
        });

        return data;
      };
      // Processing page
      const data = await page.$$eval(PAGE_CONTENT_SELECTOR, pageFunction);

      // Store asset.
      await Apify.pushData(data);

      // Find a _relative_ link to the next page and enqueue it if it exists.
      await Apify.utils.enqueueLinks({
        page,
        requestQueue,
        selector: LINK_SELECTOR,
      });
    },
  });
}

async function readCrawlerAssets() {
  const filenames = await readdir(join(REPO_ROOT, TEMP_STORAGE_PATH));
  const files = await Promise.all(
    filenames.map((filename =>
      readJSON(join(TEMP_STORAGE_PATH, filename))
    )));

  // Flatten the data
  return sortBy(prop('href'), [].concat(...files));
}

function removeApifyStorage() {
  return rimraf(join(REPO_ROOT, GENERATED, APIFY_STORAGE));
}

exports.tasks = [{
  title: 'Crawler that indexes the docs site',
  provides: ['docs-crawler'],
  run: async (requirements, utils) => {
    // Prepare a clean state for the crawler
    await removeApifyStorage();

    const crawler = await apifyCrawler({ url: 'https://taskcluster-web.netlify.com/docs' });

    await crawler.run();

    // The crawler generates multiple files (assets)
    // `readCrawlerAssets` retrieves them and merge them into a flat array
    const data = await readCrawlerAssets();

    writeJSON('generated/docs-index.json', data);

    // docs-index.json is the only asset we care about
    removeApifyStorage();
  },
}];
