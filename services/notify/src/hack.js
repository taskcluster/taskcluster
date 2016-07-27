
let IRCBot = require('./irc');

(async () => {
  let bot = new IRCBot({
    server:   'irc.mozilla.org',
    nick:     'tc-notify',
    userName: 'tc-notify',
    realName: 'TaskCluster Notification Bot',
    password: '12345',
  });

})().catch(err => console.log(err.stack));