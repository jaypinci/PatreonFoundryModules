import { MODULE_ID } from "../data/wallet.js";
import { Wallet } from "../data/wallet.js";
import { Accounts } from "../data/accounts.js";
import { Portfolio } from "../data/portfolio.js";
import { Economies, Stocks } from "../data/economy.js";
import { Ledger } from "../data/ledger.js";
import { StockChartApp } from "./stock-chart-app.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PlayerFinanceApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "financial-system-lite-player-{id}",
    classes: ["financial-system-lite", "vendit-theme"],
    tag: "div",
    window: {
      title: "financial-system-lite.app.title",
      icon: "fa-solid fa-coins",
      resizable: true
    },
    position: { width: 440, height: 560 },
    actions: {
      changeTab: PlayerFinanceApp.#onChangeTab,
      walletAdjust: PlayerFinanceApp.#onWalletAdjust,
      openAccount: PlayerFinanceApp.#onOpenAccount,
      bankAdjust: PlayerFinanceApp.#onBankAdjust,
      tradeStock: PlayerFinanceApp.#onTradeStock,
      viewStockChart: PlayerFinanceApp.#onViewStockChart,
      setStockSort: PlayerFinanceApp.#onSetStockSort
    }
  };

  static PARTS = {
    tabs: { template: `modules/${MODULE_ID}/templates/parts/tabs.hbs` },
    wallet: { template: `modules/${MODULE_ID}/templates/parts/wallet-tab.hbs`, scrollable: [""] },
    bank: { template: `modules/${MODULE_ID}/templates/parts/bank-tab.hbs`, scrollable: [""] },
    stocks: { template: `modules/${MODULE_ID}/templates/parts/stock-tab.hbs`, scrollable: [""] }
  };

  tabGroups = { primary: "wallet" };

  constructor(actor, options = {}) {
    super({ ...options, id: `financial-system-lite-player-${actor.id}` });
    this.actor = actor;
    // Player-local, per-window — not persisted, resets each time the app is opened.
    this._stockSort = { by: "symbol", dir: "asc" };
  }

  get title() {
    return `${game.i18n.localize("financial-system-lite.app.title")}: ${this.actor.name}`;
  }

  _prepareTabs() {
    const tabs = {
      wallet: { id: "wallet", group: "primary", label: "financial-system-lite.app.tabs.wallet", icon: "fa-solid fa-wallet" },
      bank: { id: "bank", group: "primary", label: "financial-system-lite.app.tabs.bank", icon: "fa-solid fa-building-columns" },
      stocks: { id: "stocks", group: "primary", label: "financial-system-lite.app.tabs.stocks", icon: "fa-solid fa-chart-line" }
    };
    for (const tab of Object.values(tabs)) {
      tab.active = this.tabGroups.primary === tab.id;
      tab.cssClass = tab.active ? "active" : "";
    }
    return tabs;
  }

  /**
   * Sorts a stock array per the window's current sort state.
   * by: "symbol" | "price" | "trend" (% change)— dir: "asc" | "desc"
   */
  _sortStocks(stocks) {
    const { by, dir } = this._stockSort;
    const sign = dir === "asc" ? 1 : -1;
    return [...stocks].sort((a, b) => {
      let cmp = 0;
      if (by === "price") cmp = a.price - b.price;
      else if (by === "trend") cmp = a.trend - b.trend;
      else cmp = a.symbol.localeCompare(b.symbol);
      return cmp * sign;
    });
  }

  async _prepareContext(options) {
    const economies = Economies.getAll();
    const accounts = Accounts.getAll(this.actor);
    const allBanks = economies.flatMap(e => e.banks.map(b => ({ ...b, economyId: e.id, economyName: e.name, currency: e.currency })));
    const openBanks = allBanks.filter(b => accounts[b.id]);
    const closedBanks = allBanks.filter(b => !accounts[b.id]);

    const stocks = this._sortStocks(Stocks.getAll());
    const portfolio = Portfolio.getAll(this.actor);
    const ownedStocks = stocks
      .filter(s => portfolio[s.id])
      .map(s => ({ ...s, shares: portfolio[s.id], totalValue: (portfolio[s.id] * s.price).toFixed(2) }));

    return {
      tabs: this._prepareTabs(),
      actor: this.actor,
      walletBalance: Wallet.getBalance(this.actor).toFixed(2),
      openBanks: openBanks.map(b => ({ ...b, balance: accounts[b.id].balance.toFixed(2) })),
      closedBanks,
      stocks,
      stockSort: this._stockSort,
      ownedStocks,
      ledger: Ledger.getLog(this.actor).slice(0, 15)
    };
  }

  /** ---------- action handlers ---------- */

  static async #onChangeTab(event, target) {
    const group = target.dataset.group;
    const tab = target.dataset.tab;
    if (!group || !tab) return;
    this.tabGroups[group] = tab;
    this.render();
  }

  static async #onWalletAdjust(event, target) {
    const direction = target.dataset.direction; // "deposit" | "withdraw"
    const input = this.element.querySelector('[name="wallet-amount"]');
    const amount = Number(input?.value);
    if (!amount || amount <= 0) return;
    try {
      const delta = direction === "deposit" ? amount : -amount;
      // Routed through Ledger (not Wallet.adjust directly) so it actually
      // shows up in the transaction log.
      await Ledger.transact(this.actor, {
        account: "wallet",
        delta,
        type: direction === "deposit" ? "walletDeposit" : "walletWithdraw"
      });
      this.render();
    } catch (err) {
      ui.notifications.error(err.message);
    }
  }

  static async #onOpenAccount(event, target) {
    const { bankId, economyId } = target.dataset;
    await Accounts.openAccount(this.actor, bankId, economyId);
    this.render();
  }

  static async #onBankAdjust(event, target) {
    const { bankId, direction } = target.dataset;
    const input = this.element.querySelector(`[name="bank-amount-${bankId}"]`);
    const amount = Number(input?.value);
    if (!amount || amount <= 0) return;
    try {
      if (direction === "deposit") {
        await Ledger.transact(this.actor, { account: "wallet", delta: -amount, type: "walletWithdraw", meta: { silent: true } });
        await Ledger.transact(this.actor, { account: bankId, delta: amount, type: "bankDeposit" });
      } else {
        await Ledger.transact(this.actor, { account: bankId, delta: -amount, type: "bankWithdraw" });
        await Ledger.transact(this.actor, { account: "wallet", delta: amount, type: "walletDeposit", meta: { silent: true } });
      }
      this.render();
    } catch (err) {
      ui.notifications.error(err.message);
    }
  }

  static async #onTradeStock(event, target) {
    const { stockId, direction } = target.dataset;
    const input = this.element.querySelector(`[name="shares-${direction}-${stockId}"]`);
    const shares = Number(input?.value);
    if (!shares || shares <= 0) return;
    try {
      await Ledger.tradeStock(this.actor, stockId, shares, direction);
      this.render();
    } catch (err) {
      ui.notifications.error(err.message);
    }
  }

  static async #onViewStockChart(event, target) {
    const { stockId } = target.dataset;
    const stock = Stocks.get(stockId);
    if (!stock) return;
    new StockChartApp(stock).render(true);
  }

  static async #onSetStockSort(event, target) {
    const by = target.dataset.sort;
    if (!by) return;
    if (this._stockSort.by === by) {
      // Same column tapped again — flip direction.
      this._stockSort.dir = this._stockSort.dir === "asc" ? "desc" : "asc";
    } else {
      // New column — alphabetical defaults ascending (A–Z first), price and
      // % change default descending (biggest/most-gained first is more useful).
      this._stockSort.by = by;
      this._stockSort.dir = by === "symbol" ? "asc" : "desc";
    }
    this.render();
  }
}
