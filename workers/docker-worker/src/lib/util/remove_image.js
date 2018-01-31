module.exports = {
  async removeImage(docker, image) {
    let dockerImage = docker.getImage(image);
    try {
      await dockerImage.remove({force: true});
    } catch(e) {
      if (e.reason === 'no such image') {
        return;
      }

      throw e;
    }
  }
};
