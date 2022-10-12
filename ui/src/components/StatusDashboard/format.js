const intl = new Intl.NumberFormat('en-US');

export default val => intl.format(val);
