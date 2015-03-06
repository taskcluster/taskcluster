import request from 'superagent-promise';

export default async (url) => {
  return (await request.get(url).end()).text;
}
