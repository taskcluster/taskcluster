export default async function (duration) {
  return new Promise(accept => setTimeout(accept, duration));
}
