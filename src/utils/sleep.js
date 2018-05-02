// TODO: Delete after we have a better way to attach credentials to requests
const sleep = time => new Promise(r => setTimeout(r, time));

export default sleep;
