import { MODULE_ID } from "../data/wallet.js";
import { Ledger } from "../data/ledger.js";
import { Economies } from "../data/economy.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TX_TYPES = ["walletDeposit", "walletWithdraw", "bankDeposit", "bankWithdraw", "stockBuy", "stockSell", "vendorPurchase", "externalAdjustment"];

/**
 * GM-facing aggregate log. Ledger entries live on individual actor flags
 * (see data/ledger.js), so this app's whole job is walking every actor,
 * pulling their log, tagging it with actor identity, and filtering the
 * combined set — nothing is stored here, it's a pure read/aggregate view.
 */
export class TransactionLogApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "financial-system-lite-transaction-log",
    classes: ["financial-system-lite", "vendit-theme"],
    tag: "div",
    window: {
      title: "financial-system-lite.log.title",
      icon: "fa-solid fa-file-invoice-dollar",
      resizable: true
    },
    position: { width: 680, height: 640 },
    actions: {
      applyFilters: TransactionLogApp.#onApplyFilters,
      resetFilters: TransactionLogApp.#onResetFilters
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/transaction-log.hbs`, scrollable: [""] }
  };

  filters = { actorId: "all", type: "all", start: "", end: "" };

  async _prepareContext(options) {
    const actorsWithLogs = game.actors.filter(a => Ledger.getLog(a).length > 0);

    let entries = [];
    for (const actor of actorsWithLogs) {
      for (const entry of Ledger.getLog(actor)) {
        entries.push({ ...entry, actorId: actor.id, actorName: actor.name });
      }
    }

    entries = entries.filter(e => {
      if (this.filters.actorId !== "all" && e.actorId !== this.filters.actorId) return false;
      if (this.filters.type !== "all" && e.type !== this.filters.type) return false;
      if (this.filters.start && e.timestamp < new Date(this.filters.start).getTime()) return false;
      if (this.filters.end && e.timestamp > new Date(this.filters.end).getTime() + 86_400_000) return false;
      return true;
    });

    entries.sort((a, b) => b.timestamp - a.timestamp);

    return {
      entries: entries.map(e => ({
        ...e,
        dateLabel: new Date(e.timestamp).toLocaleString(),
        detail: this._describe(e)
      })),
      actors: actorsWithLogs.map(a => ({ id: a.id, name: a.name })),
      types: TX_TYPES,
      filters: this.filters
    };
  }

  _describe(entry) {
    if (entry.meta?.symbol) return `${entry.meta.symbol} × ${entry.meta.shares} @ ${entry.meta.price}`;
    if (entry.meta?.itemName) return `${entry.meta.itemName}${entry.meta.source ? ` (${entry.meta.source})` : ""}`;
    if (typeof entry.account === "string" && entry.account !== "wallet") {
      const found = Economies.getBank(entry.account);
      return found ? found.bank.name : "";
    }
    return "";
  }

  static async #onApplyFilters(event, target) {
    const form = this.element.querySelector("form.fsl-log-filters");
    this.filters = {
      actorId: form.elements.actorId.value,
      type: form.elements.type.value,
      start: form.elements.start.value,
      end: form.elements.end.value
    };
    this.render();
  }

  static async #onResetFilters() {
    this.filters = { actorId: "all", type: "all", start: "", end: "" };
    this.render();
  }
}
