// @flow
function red(str /*: string */) /*: string */ {
  const open = '\u001b[31m';
  const close = '\u001b[39m';
  return `${open}${str}${close}`;
}

module.exports = {red};
