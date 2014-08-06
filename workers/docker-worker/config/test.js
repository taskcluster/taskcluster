module.exports = {
  testMode: true,

  logging: {
    // Expires one hour from now so test logs don't live too long...
    liveLogExpires: 3600,
    bulkLogExpires: 3600
  }
};
