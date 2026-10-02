// Pure evidence transforms for the supported account actions.
export const userIdOf = value => typeof value === 'object' ? value?._id || value?.id : value;
export const txTime = tx => Date.parse(tx.createdAt || tx.timestamp || tx.date || '') || 0;
export function actionTimeFor(tx, uid, type) {
  const seller = userIdOf(tx.sellerId || tx.seller);
  if (type === 'wage' && seller !== uid) return null;
  if (type === 'trading' || type === 'battleLoot') return null;
  if (type === 'itemMarket') {
    // A buyer's purchase timestamp is not this account's listing action.
    if (seller !== uid) return null;
    return Date.parse(tx.offerCreatedAt || '') || null;
  }
  return txTime(tx) || null;
}

export function deepDiveEventFor(tx, uid, type) {
  // These feeds cannot establish the listing/drop times needed by this explorer.
  if (type === 'trading' || type === 'battleLoot') return null;
  const seller = userIdOf(tx.sellerId || tx.seller);
  const side = type === 'itemMarket' && seller === uid ? 'sell' : null;
  const itemCode = tx.itemCode ?? tx.item?.code ?? null;
  if (type === 'donation' || type === 'articleTip') {
    const sender = userIdOf(tx.sender || tx.senderId || tx.buyerId || tx.from || tx.fromId);
    if (sender !== uid) return null;
  }
  const t = actionTimeFor(tx, uid, type);
  if (!Number.isFinite(t)) return null;
  const timeMeaning = type === 'itemMarket' ? 'Listing' : 'Observed action';
  const itemId = typeof tx.item === 'object' ? userIdOf(tx.item) : /^[a-f\d]{24}$/i.test(tx.item || '') ? tx.item : null;
  const listingId = itemId || tx._id;
  return { t, type, side, itemCode, timingKnown:true, timeMeaning, dedupKey: type === 'itemMarket' && listingId ? `${type}/${uid}/${t}/${listingId}` : null };
}
