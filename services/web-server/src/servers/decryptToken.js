export const decryptToken = (token) => {
  return JSON.parse(Buffer.from(
    token.replace('Bearer ', ''),
    'base64',
  ).toString(),
  );
};
