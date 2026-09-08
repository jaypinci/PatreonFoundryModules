import { MODULE_ID } from "./wallet.js";
import { Wallet } from "./wallet.js";
import { Accounts } from "./accounts.js";
import { Portfolio } from "./portfolio.js";
import { Stocks } from "./economy.js";
import { requestShareAdjustment } from "../sockets.js";

const MAX_LOG_ENTRIES = 100;

/**
 * Single entry point for every balance-changing action in the module.
 * Wallet transfers, bank deposits, and stock trades all route through
 * here so there's exactly one place that mutates + logs, instead of
 * three parallel manager classes.
 */
export class Ledger {
  /**
   * @param {Actor} actor
   * @param {object} opts
   * @param {"wallet"|string} opts.account  "wallet" or a bankId
   * @param {number} opts.delta             positive = credit, negative = debit
   * @param {string} opts.type              e.g. "bankDeposit", "walletWithdraw", "stockBuy"
   * @param {object} [opts.meta]            extra info for the log (stockId, shares, etc).
   *                                        meta.silent hides it from the human-facing log —
   *                                        used for the wallet-side half of a bank
   *                                        deposit/withdraw so each action shows as one
   *                                        line instead of two.
   */
  static async transact(actor, { account, delta, type, meta = {} }) {
    if (account === "wallet") {
      await Wallet.adjust(actor, delta);
    } else {
      await Accounts.adjustBalance(actor, account, delta);
    }
    await this._log(actor, { account, delta, type, meta });
  }

  /** Move money from wallet/account into a stock purchase, or back out on a sale. */
  static async tradeStock(actor, stockId, shares, direction) {
    const stock = Stocks.get(stockId);
    if (!stock) throw new Error(game.i18n.localize("financial-system-lite.errors.stockNotFound"));

    const cost = stock.price * shares;
    const sign = direction === "buy" ? -1 : 1;

    if (direction === "buy" && Wallet.getBalance(actor) < cost) {
      throw new Error(game.i18n.localize("financial-system-lite.errors.insufficientWallet"));
    }
    if (direction === "sell" && Portfolio.getShares(actor, stockId) < shares) {
      throw new Error(game.i18n.localize("financial-system-lite.errors.insufficientShares"));
    }

    // Shared resource (sharesAvailable) — narrow GM relay only for this piece.
    await requestShareAdjustment(stockId, direction === "buy" ? -shares : shares);

    await Wallet.adjust(actor, sign * cost);
    await Portfolio.adjustShares(actor, stockId, direction === "buy" ? shares : -shares);

    await this._log(actor, {
      account: "wallet",
      delta: sign * cost,
      type: direction === "buy" ? "stockBuy" : "stockSell",
      meta: { stockId, symbol: stock.symbol, shares, price: stock.price }
    });
  }

  /** @param {{includeSilent?: boolean}} [options] */
  static getLog(actor, { includeSilent = false } = {}) {
    const log = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "ledger") ?? []);
    return includeSilent ? log : log.filter(e => !e.meta?.silent);
  }

  static async _log(actor, entry) {
    // Store the full log (including silent entries) so nothing is lost;
    // getLog() just filters what's shown by default.
    const log = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "ledger") ?? []);
    log.unshift({ ...entry, timestamp: Date.now() });
    if (log.length > MAX_LOG_ENTRIES) log.length = MAX_LOG_ENTRIES;
    await actor.setFlag(MODULE_ID, "ledger", log);
  }
}
