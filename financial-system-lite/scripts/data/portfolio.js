import { MODULE_ID } from "./wallet.js";

/**
 * Stock holdings, keyed by stockId, stored on the actor.
 * flags.financial-system-lite.portfolio = { [stockId]: shares }
 */
export class Portfolio {
  static getAll(actor) {
    return foundry.utils.deepClone(actor.getFlag(MODULE_ID, "portfolio") ?? {});
  }

  static getShares(actor, stockId) {
    return Number(this.getAll(actor)[stockId] ?? 0);
  }

  static async adjustShares(actor, stockId, delta) {
    const holdings = this.getAll(actor);
    const next = (Number(holdings[stockId]) || 0) + Number(delta);
    if (next < 0) throw new Error(game.i18n.localize("financial-system-lite.errors.insufficientShares"));
    if (next === 0) {
      // setFlag deep-merges objects, so omitting the key from `holdings` does NOT
      // remove it from the stored flag — Foundry's `-=key` deletion syntax is
      // required to actually strip it out. This was the source of the sell-100%
      // bug: shares appeared to be sold (money changed hands) but the stock
      // never left the portfolio.
      delete holdings[stockId];
      await actor.setFlag(MODULE_ID, "portfolio", { [`-=${stockId}`]: null });
    } else {
      holdings[stockId] = next;
      await actor.setFlag(MODULE_ID, "portfolio", holdings);
    }
    return next;
  }
}
