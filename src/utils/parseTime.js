// Regular expression matching:
// A years B months C days D hours E minutes F seconds
const timeExpression = new RegExp(
  [
    '^(\\s*(-|\\+))?',
    '(\\s*(\\d+)\\s*y((ears?)|r)?)?',
    '(\\s*(\\d+)\\s*mo(nths?)?)?',
    '(\\s*(\\d+)\\s*w((eeks?)|k)?)?',
    '(\\s*(\\d+)\\s*d(ays?)?)?',
    '(\\s*(\\d+)\\s*h((ours?)|r)?)?',
    '(\\s*(\\d+)\\s*m(in(utes?)?)?)?',
    '(\\s*(\\d+)\\s*s(ec(onds?)?)?)?',
    '\\s*$',
  ].join(''),
  'i'
);

export default (str = '') => {
  // Parse the string
  const match = timeExpression.exec(str);

  if (!match) {
    throw new Error(`"${str}" is not a valid time expression`);
  }

  // Negate if needed
  const neg = match[2] === '-' ? -1 : 1;

  // Return parsed values
  return {
    years: parseInt(match[4] || 0, 10) * neg,
    months: parseInt(match[8] || 0, 10) * neg,
    weeks: parseInt(match[11] || 0, 10) * neg,
    days: parseInt(match[15] || 0, 10) * neg,
    hours: parseInt(match[18] || 0, 10) * neg,
    minutes: parseInt(match[22] || 0, 10) * neg,
    seconds: parseInt(match[25] || 0, 10) * neg,
  };
};
