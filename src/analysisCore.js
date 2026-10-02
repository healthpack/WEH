// Pure evidence transforms. Unknown resource-order ownership is not human activity.
export const userIdOf = value => typeof value === 'object' ? value?._id || value?.id : value;
export const txTime = tx => Date.parse(tx.createdAt || tx.timestamp || tx.date || '') || 0;
export function actionTimeFor(tx, uid, type) {
  const seller = userIdOf(tx.sellerId || tx.seller);
  const buyer = userIdOf(tx.buyerId || tx.buyer);
  if (type === 'wage' && seller !== uid) return null;
  if (type === 'trading') return null;
  if (type === 'itemMarket') {
    if (seller === uid) return Date.parse(tx.offerCreatedAt || '') || null;
    if (buyer !== uid) return null;
  }
  return txTime(tx) || null;
}

export function caseLoot(tx) {
  const code = tx.itemCode ?? tx.item?.code;
  // Chest armor is equipment, not a loot case. Unknown codes do not establish a case.
  return /^case(?:[1-9]\d*)?$/i.test(String(code || '')) || (!code && tx.item?.type === 'case');
}

export function deepDiveEventFor(tx, uid, type) {
  const seller = userIdOf(tx.sellerId || tx.seller), buyer = userIdOf(tx.buyerId || tx.buyer);
  const side = ['itemMarket', 'trading'].includes(type) ? seller === uid ? 'sell' : buyer === uid ? 'buy' : null : null;
  const itemCode = tx.itemCode ?? tx.item?.code ?? null;
  if (type === 'battleLoot' && (!caseLoot(tx) || buyer !== uid)) return null;
  if (type === 'trading') {
    if (seller !== uid || buyer === uid) return null;
    const t = Date.parse(tx.offerCreatedAt || '');
    if (!Number.isFinite(t)) return null;
    // The feed does not identify the offer owner. A sale can fill a resting BUY order.
    // Keep the requested sell-side offer observations, but never certify them as input.
    return { t, type, side: 'sell', itemCode, timingKnown: false, timeMeaning: 'Offer creation; owner unverified', dedupKey: `trading/${uid}/${itemCode}/${t}` };
  }
  const t = actionTimeFor(tx, uid, type);
  if (!Number.isFinite(t)) return null;
  let timingKnown = true, timeMeaning = type === 'battleLoot' ? 'Case drop on attack' : type === 'itemMarket' && side === 'sell' ? 'Listing' : 'Observed action';
  if (type === 'donation' || type === 'articleTip') {
    const sender = userIdOf(tx.sender || tx.senderId || tx.buyerId || tx.from || tx.fromId || tx.userId);
    if (sender !== uid) { timingKnown = false; timeMeaning = 'Received transfer; not own input'; }
  }
  return { t, type, side, itemCode, timingKnown, timeMeaning, dedupKey: type === 'itemMarket' && side === 'sell' ? tx._id || `${type}/${t}/${tx.item?._id || itemCode}` : null };
}
