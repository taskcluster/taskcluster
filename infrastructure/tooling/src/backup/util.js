exports.fail = msg => {
  console.error(msg);
  process.exit(1);
};

exports.parseResource = rsrc => {
  const match = /([^\/]*)\/(.*)/.exec(rsrc);
  if (!match) {
    throw new Error(`Invalid resource name ${rsrc}`);
  }
  const type = match[1];
  const name = match[2];
  return [type, name];
};
