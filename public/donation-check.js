globalThis.DonationCheck = (() => {
  function options(list) {
    return String(list).split(/[,;\n]+|\s+(?:and|or|&)\s+/i)
      .map(item => item.replace(/^\s*(?:and|or)\s+/i, '').trim())
      .filter(Boolean);
  }
  function normalize(item) {
    return item.normalize('NFKC').toLowerCase().trim()
      .replace(/[.!]+$/, '').replace(/\s+/g, ' ');
  }
  function withoutQuantity(item) {
    return normalize(item).replace(/^\d+(?:\.\d+)?\s+(?:(?:bags?|boxes?|cans?|packs?|bottles?|pairs?)\s+of\s+)?/, '');
  }
  function check(list, pledge) {
    const accepted = options(list);
    const entered = options(pledge);
    const valid = entered.length > 0 && entered.every(item => accepted.some(
      option => normalize(item) === normalize(option) || withoutQuantity(item) === normalize(option)
    ));
    return {valid, message: valid ? '' : `Please bring ${accepted.join(', ')}. Choose from this drive’s list; use the item buttons if you need help.`};
  }
  return {options, check};
})();
