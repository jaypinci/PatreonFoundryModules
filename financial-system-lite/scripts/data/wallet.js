export const MODULE_ID = "financial-system-lite";

/**
 * Wallet = cash on hand, stored on the actor itself.
 * Actor owners can write this directly — no GM relay needed.
 */
export class Wallet {
  static getBalance(actor) {
    return Number(actor.getFlag(MODULE_ID, "wallet.balance") ?? 0);
  }

  static async setBalance(actor, value) {
    return actor.setFlag(MODULE_ID, "wallet.balance", Math.max(0, Number(value)));
  }

  static async adjust(actor, delta) {
    const current = this.getBalance(actor);
    const next = current + Number(delta);
    if (next < 0) throw new Error(game.i18n.localize("financial-system-lite.errors.insufficientWallet"));
    return this.setBalance(actor, next);
  }
}
