import request from 'superagent-promise';

export default async (url) => {
  try {
    let response = await request.get(url).end();
    return response.text;
  }
  catch (e) {
    console.error(`error retrieving artifact. ${e.error} URL: ${url}`);
    return null;
  }
};
