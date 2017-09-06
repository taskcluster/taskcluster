export const succeedWith = (response) => {
  window.fetch.returns(Promise.resolve(new Response(
    JSON.stringify(response),
    { status: 200, headers: { 'Content-Type': 'application/json'} }
  )));
};

export const failWith = (statusCode, statusText, message, body = {}) => {
  window.fetch.returns(Promise.reject(Object.assign(new Error(message), {
    response: new Response(JSON.stringify(body), {
      ok: false,
      statusText,
      status: statusCode
    }),
    body: JSON.stringify(body)
  })));
};
