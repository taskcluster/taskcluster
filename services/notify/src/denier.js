class Denier {
  constructor({emailBlacklist, db}) {
    this.emailBlacklist = emailBlacklist;
    this.db = db;
  }

  async isDenied(notificationType, notificationAddress) {
    if (notificationType === 'email') {
      if ((this.emailBlacklist || []).includes(notificationAddress)) {
        return true;
      }
    }

    const address = {notificationType, notificationAddress};
    let [{exists_denylist_address}] = await this.db.fns.exists_denylist_address(
      address.notificationType,
      address.notificationAddress,
    );
    return exists_denylist_address;
  }
}

module.exports = Denier;
