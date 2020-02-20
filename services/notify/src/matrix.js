const loglevel = require('loglevel');

class MatrixBot {
  constructor({matrixClient, userId, monitor}) {
    this._userId = userId;
    this._client = matrixClient;
    this._monitor = monitor;

    // matrix-js-sdk insists on logging a bunch of stuff to this logger
    // we will override the methods and stick them all in trace messages
    // for structured logging instead since it also throws errors like normal
    const matrixLog = loglevel.getLogger('matrix');
    matrixLog.methodFactory = (methodName, level, loggerName) => message => {
      this._monitor.log.matrixSdkDebug({level, message});
    };
    matrixLog.setLevel(matrixLog.getLevel()); // This makes the methodFactory stuff work
  }

  async start() {
    this._client.on('RoomMember.membership', async (event, member) => {
      if (member.membership === "invite" && member.userId === this._userId) {
        await this._client.joinRoom(member.roomId);
      }
    });
    await this._client.startClient();
  }

  async sendNotice({roomId, format, formattedBody, body}) {
    try {
      await this._client.sendEvent(roomId, 'm.room.message', {formatted_body: formattedBody, body, msgtype: 'm.notice', format}, '');
    } catch (err) {
      // This just means that we haven't been invited to the room yet
      if (err.errcode === 'M_FORBIDDEN') {
        this._monitor.log.matrixForbidden({roomId});
        return;
      }
      throw err;
    }
  }
}

module.exports = MatrixBot;
