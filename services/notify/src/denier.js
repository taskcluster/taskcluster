class Denier {
  constructor({DenylistedNotification, emailBlacklist}) {
    this.DenylistedNotification = DenylistedNotification;
    this.emailBlacklist = emailBlacklist;
  }

  async isDenied(notificationType, notificationAddress) {
    if (notificationType === 'email') {
      if ((this.emailBlacklist || []).includes(notificationAddress)) {
        return true;
      }
    }

    const address = {notificationType, notificationAddress};
    return !!await this.DenylistedNotification.load(address, true);
  }
}

module.exports = Denier;
