import logo from '../images/logo.png';

/*
 Display a Desktop notification using the Notifications API to the user.
 */
export default ({ body, icon }) => {
  const notification = new Notification(process.env.APPLICATION_NAME, {
    icon: icon || logo,
    body,
  });

  notification.addEventListener('click', () => {
    notification.close();
    window.focus();
  });

  setTimeout(notification.close, 30000);
};
