import { MODULE_ID } from "./wallet.js";

/**
 * Bank accounts, keyed by bankId, stored on the actor.
 * flags.financial-system-lite.accounts = { [bankId]: { balance, economyId } }
 */
export class Accounts {
  static getAll(actor) {
    return foundry.utils.deepClone(actor.getFlag(MODULE_ID, "accounts") ?? {});
  }

  static getAccount(actor, bankId) {
    return this.getAll(actor)[bankId] ?? null;
  }

  static hasAccount(actor, bankId) {
    return !!this.getAccount(actor, bankId);
  }

  static async openAccount(actor, bankId, economyId) {
    if (this.hasAccount(actor, bankId)) return this.getAccount(actor, bankId);
    const accounts = this.getAll(actor);
    accounts[bankId] = { balance: 0, economyId };
    await actor.setFlag(MODULE_ID, "accounts", accounts);
    return accounts[bankId];
  }

  static async adjustBalance(actor, bankId, delta) {
    const accounts = this.getAll(actor);
    const account = accounts[bankId];
    if (!account) throw new Error(game.i18n.localize("financial-system-lite.errors.accountNotFound"));
    const next = Number(account.balance) + Number(delta);
    if (next < 0) throw new Error(game.i18n.localize("financial-system-lite.errors.insufficientBalance"));
    account.balance = next;
    await actor.setFlag(MODULE_ID, "accounts", accounts);
    return account;
  }
}
