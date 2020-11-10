/**
 * Return externalBuildUrl or externalBuildSignedUrl, depending on whether the client has credentials
 */
module.exports = (client, isAuthed) => {
  return (isAuthed ? client.externalBuildSignedUrl : client.externalBuildUrl).bind(client);
};
