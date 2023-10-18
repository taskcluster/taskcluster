/**
 * Return externalBuildUrl or externalBuildSignedUrl, depending on whether the client has credentials
 */
export default (client, isAuthed) => {
  return (isAuthed ? client.externalBuildSignedUrl : client.externalBuildUrl).bind(client);
};
