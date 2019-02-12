/*
  A utility to scroll the window to the URL hash.
  This is useful for documentation where a user navigating
  to a hashed URL should land in the appropriate section.
 */
export default (offset = 0) => {
  const appBarHeight = document.querySelector('header').offsetHeight;
  const { hash } = window.location;

  if (hash !== '') {
    // Push onto callback queue so top - ns after the DOM is updated - it,
    // this is required when navigating from a different page so that
    // the element is rendered on the page before trying to getElementById.
    setTimeout(() => {
      const id = hash.replace('#', '');
      const element = document.getElementById(id);
      const { top } = element.getBoundingClientRect();

      if (element) {
        window.scrollBy({
          behavior: 'smooth',
          top: top - appBarHeight - offset,
        });
      }
    }, 0);
  }
};
