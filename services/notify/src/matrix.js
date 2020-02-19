class MatrixBot {
  constructor({matrixClient, userId}) {
    this._userId = userId;
    this._client = matrixClient;
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
    await this._client.sendEvent(roomId, 'm.room.message', {formatted_body: formattedBody, body, msgtype: 'm.notice', format}, '');
  }
}

module.exports = MatrixBot;
