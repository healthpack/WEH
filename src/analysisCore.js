// Pure evidence transforms. Unknown resource-order ownership is not human activity.
export const userIdOf = value => typeof value === 'object' ? value?._id || value?.id : value;
export const txTime = tx => Date.parse(tx.createdAt || tx.timestamp || tx.date || '') || 0;
export function actionTimeFor(tx, uid, type) {
  const seller = userIdOf(tx.sellerId || tx.seller);
  if (type === 'wage' && seller !== uid) return null;
  if (type === 'trading') return null;
  if (type === 'itemMarket') {
    // A buyer's purchase timestamp is not this account's listing action.
    if (seller !== uid) return null;
    return Date.parse(tx.offerCreatedAt || '') || null;
  }
  return txTime(tx) || null;
}

export function caseLoot(tx) {
  const code = tx.itemCode ?? tx.item?.code;
  // Chest armor is equipment, not a loot case. Unknown codes do not establish a case.
  return /^(?:case(?:[1-9]\d*)?|woodenCase)$/i.test(String(code || '')) || (!code && tx.item?.type === 'case');
}

export function deepDiveEventFor(tx, uid, type) {
  const seller = userIdOf(tx.sellerId || tx.seller), buyer = userIdOf(tx.buyerId || tx.buyer);
  const side = type === 'itemMarket' && seller === uid ? 'sell' : null;
  const itemCode = tx.itemCode ?? tx.item?.code ?? null;
  if (type === 'battleLoot' && (!caseLoot(tx) || buyer !== uid)) return null;
  if (type === 'trading') {
    // Resource transactions expose offerCreatedAt but no offer owner or order side.
    // The selected seller can be filling somebody else's resting BUY order.
    // Neither that timestamp nor fill time proves the selected user placed a listing.
    return null;
  }
  if (type === 'donation' || type === 'articleTip') {
    const sender = userIdOf(tx.sender || tx.senderId || tx.buyerId || tx.from || tx.fromId);
    if (sender !== uid) return null;
  }
  const t = actionTimeFor(tx, uid, type);
  if (!Number.isFinite(t)) return null;
  const timeMeaning = type === 'battleLoot' ? 'Case drop on attack' : type === 'itemMarket' ? 'Listing' : 'Observed action';
  const itemId = typeof tx.item === 'object' ? userIdOf(tx.item) : /^[a-f\d]{24}$/i.test(tx.item || '') ? tx.item : null;
  const listingId = itemId || tx._id;
  return { t, type, side, itemCode, timingKnown:true, timeMeaning, dedupKey: type === 'itemMarket' && listingId ? `${type}/${uid}/${t}/${listingId}` : null };
}
