import { MODULE_ID } from "./wallet.js";

/**
 * Shared reference data — GM-authored, rarely written, world-scoped.
 * economies:  [{ id, name, currency, banks: [{ id, name, interestRate }] }]
 * stocks:     [{ id, economyId, symbol, name, price, trend, sharesAvailable, totalShares, history: [{t, price}] }]
 *
 * NOTE: these settings are only ever written by the GM (config app / GM macros).
 * Player-driven changes to `stocks.sharesAvailable` go through sockets.js.
 */
export function registerEconomySettings() {
  game.settings.register(MODULE_ID, "economies", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, "stocks", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });
}

export class Economies {
  static getAll() {
    return foundry.utils.deepClone(game.settings.get(MODULE_ID, "economies"));
  }

  static get(economyId) {
    return this.getAll().find(e => e.id === economyId) ?? null;
  }

  static getBank(bankId) {
    for (const economy of this.getAll()) {
      const bank = economy.banks?.find(b => b.id === bankId);
      if (bank) return { bank, economy };
    }
    return null;
  }

  static async create({ name, currency }) {
    const economies = this.getAll();
    const economy = {
      id: foundry.utils.randomID(),
      name: name || game.i18n.localize("financial-system-lite.economy.defaultName"),
      currency: currency || game.i18n.localize("financial-system-lite.economy.defaultCurrency"),
      banks: []
    };
    economies.push(economy);
    await game.settings.set(MODULE_ID, "economies", economies);
    return economy;
  }

  static async delete(economyId) {
    const economies = this.getAll().filter(e => e.id !== economyId);
    await game.settings.set(MODULE_ID, "economies", economies);
  }

  static async addBank(economyId, { name, interestRate = 0 }) {
    const economies = this.getAll();
    const economy = economies.find(e => e.id === economyId);
    if (!economy) throw new Error(game.i18n.localize("financial-system-lite.errors.economyNotFound"));
    const bank = { id: foundry.utils.randomID(), name, interestRate };
    economy.banks.push(bank);
    await game.settings.set(MODULE_ID, "economies", economies);
    return bank;
  }

  static async removeBank(economyId, bankId) {
    const economies = this.getAll();
    const economy = economies.find(e => e.id === economyId);
    if (!economy) return;
    economy.banks = economy.banks.filter(b => b.id !== bankId);
    await game.settings.set(MODULE_ID, "economies", economies);
  }
}

export class Stocks {
  static getAll() {
    return foundry.utils.deepClone(game.settings.get(MODULE_ID, "stocks"));
  }

  static get(stockId) {
    return this.getAll().find(s => s.id === stockId) ?? null;
  }

  static getByEconomy(economyId) {
    return this.getAll().filter(s => s.economyId === economyId);
  }

  static async create({ economyId, symbol, name, price, totalShares }) {
    const stocks = this.getAll();
    const stock = {
      id: foundry.utils.randomID(),
      economyId,
      symbol: (symbol || "STK").toUpperCase().slice(0, 5),
      name: name || game.i18n.localize("financial-system-lite.stock.defaultName"),
      price: Number(price) || 100,
      trend: 0,
      sharesAvailable: Number(totalShares) || 1000,
      totalShares: Number(totalShares) || 1000,
      history: [{ t: Date.now(), price: Number(price) || 100 }]
    };
    stocks.push(stock);
    await game.settings.set(MODULE_ID, "stocks", stocks);
    return stock;
  }

  static async delete(stockId) {
    const stocks = this.getAll().filter(s => s.id !== stockId);
    await game.settings.set(MODULE_ID, "stocks", stocks);
  }

  /**
   * Hook point for anything that should move the market — a GM macro,
   * a future faction-turn system, a scripted event. No dedicated
   * subsystem required; just call this with a % shift.
   */
  static async applyShift(stockId, deltaPercent, reason = "manual") {
    const stocks = this.getAll();
    const stock = stocks.find(s => s.id === stockId);
    if (!stock) return null;
    const newPrice = Math.max(1, Math.round(stock.price * (1 + deltaPercent / 100)));
    stock.trend = deltaPercent;
    stock.price = newPrice;
    stock.history.push({ t: Date.now(), price: newPrice });
    if (stock.history.length > 50) stock.history.shift();
    await game.settings.set(MODULE_ID, "stocks", stocks);
    Hooks.callAll(`${MODULE_ID}.marketShift`, { stockId, deltaPercent, reason, newPrice });
    return stock;
  }

  /** GM-only direct write. Player-initiated changes must go through sockets.js. */
  static async _adjustSharesAvailable(stockId, delta) {
    const stocks = this.getAll();
    const stock = stocks.find(s => s.id === stockId);
    if (!stock) throw new Error(game.i18n.localize("financial-system-lite.errors.stockNotFound"));
    const next = stock.sharesAvailable + delta;
    if (next < 0) throw new Error(game.i18n.localize("financial-system-lite.stock.notEnoughSharesAvailable"));
    stock.sharesAvailable = next;
    await game.settings.set(MODULE_ID, "stocks", stocks);
    return stock;
  }
}
