import { MODULE_ID } from "../data/wallet.js";
import { Economies, Stocks } from "../data/economy.js";
import { LegacyImporter } from "../data/import.js";
import { PlayerFinanceApp } from "./player-app.js";
import { TransactionLogApp } from "./transaction-log-app.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Max +/- percent for each volatility tier. Rolled as a random whole-number
 *  percent uniformly in [-max, max] and passed straight to Stocks.applyShift. */
const VOLATILITY_LEVELS = {
  stable: 1,
  semiStable: 5,
  volatile: 20,
  extremelyVolatile: 50,
  unstable: 100
};

export class GMConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "financial-system-lite-gm-config",
    classes: ["financial-system-lite", "vendit-theme"],
    tag: "div",
    window: {
      title: "financial-system-lite.gmConfig.title",
      icon: "fa-solid fa-sliders",
      resizable: true
    },
    position: { width: 520, height: 680 },
    actions: {
      createEconomy: GMConfigApp.#onCreateEconomy,
      deleteEconomy: GMConfigApp.#onDeleteEconomy,
      addBank: GMConfigApp.#onAddBank,
      removeBank: GMConfigApp.#onRemoveBank,
      createStock: GMConfigApp.#onCreateStock,
      deleteStock: GMConfigApp.#onDeleteStock,
      shiftStock: GMConfigApp.#onShiftStock,
      shiftStockRandom: GMConfigApp.#onShiftStockRandom,
      shiftEconomyStocksRandom: GMConfigApp.#onShiftEconomyStocksRandom,
      viewActorFinances: GMConfigApp.#onViewActorFinances,
      openTransactionLog: GMConfigApp.#onOpenTransactionLog,
      importLegacyData: GMConfigApp.#onImportLegacyData
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/gm-config.hbs`, scrollable: [""] }
  };

  async _prepareContext(options) {
    const economies = Economies.getAll();
    const stocks = Stocks.getAll();

    // "View as player" — any actor a player owns, plus any actor of type
    // "character" (covers NPC bank-adjacent actors too, e.g. a banker).
    const actors = game.actors
      .filter(a => a.hasPlayerOwner || a.type === "character")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(a => ({ id: a.id, name: a.name, img: a.img }));

    return {
      economies: economies.map(e => ({ ...e, stocks: stocks.filter(s => s.economyId === e.id) })),
      actors,
      legacyAvailable: LegacyImporter.isLegacyAvailable()
    };
  }

  /** ---------- action handlers ---------- */

  static async #onCreateEconomy() {
    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("financial-system-lite.economy.create") },
      content: `<input type="text" name="name" placeholder="${game.i18n.localize("financial-system-lite.economy.name")}">`,
      ok: { callback: (event, button) => button.form.elements.name.value }
    });
    if (!name) return;
    await Economies.create({ name });
    this.render();
  }

  static async #onDeleteEconomy(event, target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("financial-system-lite.economy.delete") }
    });
    if (!confirmed) return;
    await Economies.delete(target.dataset.economyId);
    this.render();
  }

  static async #onAddBank(event, target) {
    const economyId = target.dataset.economyId;
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("financial-system-lite.bank.create") },
      content: `<input type="text" name="name" placeholder="${game.i18n.localize("financial-system-lite.bank.name")}">
                 <input type="number" name="interestRate" placeholder="${game.i18n.localize("financial-system-lite.bank.interestRate")}" value="0" step="0.1">`,
      ok: { callback: (event, button) => ({ name: button.form.elements.name.value, interestRate: Number(button.form.elements.interestRate.value) }) }
    });
    if (!result?.name) return;
    await Economies.addBank(economyId, result);
    this.render();
  }

  static async #onRemoveBank(event, target) {
    const { economyId, bankId } = target.dataset;
    await Economies.removeBank(economyId, bankId);
    this.render();
  }

  static async #onCreateStock(event, target) {
    const economyId = target.dataset.economyId;
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("financial-system-lite.stock.create") },
      content: `<input type="text" name="symbol" placeholder="SYM" maxlength="5">
                 <input type="text" name="name" placeholder="${game.i18n.localize("financial-system-lite.stock.name")}">
                 <input type="number" name="price" placeholder="${game.i18n.localize("financial-system-lite.stock.currentPrice")}" value="100">
                 <input type="number" name="totalShares" placeholder="${game.i18n.localize("financial-system-lite.stock.totalShares")}" value="1000">`,
      ok: {
        callback: (event, button) => ({
          symbol: button.form.elements.symbol.value,
          name: button.form.elements.name.value,
          price: Number(button.form.elements.price.value),
          totalShares: Number(button.form.elements.totalShares.value)
        })
      }
    });
    if (!result) return;
    await Stocks.create({ economyId, ...result });
    this.render();
  }

  static async #onDeleteStock(event, target) {
    await Stocks.delete(target.dataset.stockId);
    this.render();
  }

  /** Manual market-nudge — the replacement for the old faction-turn coupling. */
  static async #onShiftStock(event, target) {
    const { stockId } = target.dataset;
    const percent = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("financial-system-lite.stock.shiftMarket") },
      content: `<input type="number" name="percent" placeholder="%" value="0" step="0.5">`,
      ok: { callback: (event, button) => Number(button.form.elements.percent.value) }
    });
    if (percent === null || Number.isNaN(percent)) return;
    await Stocks.applyShift(stockId, percent, "gm-manual");
    this.render();
  }

  /** Rolls a random whole-number percent within the chosen volatility tier's
   *  +/- range and applies it — the one-click alternative to typing an exact
   *  percent into the manual Shift Price dialog above. Every integer in
   *  [-max, max] is equally likely (uniform, not weighted toward 0). */
  static async #onShiftStockRandom(event, target) {
    const { stockId, volatility } = target.dataset;
    const max = VOLATILITY_LEVELS[volatility];
    if (max === undefined) return;
    const percent = Math.floor(Math.random() * (2 * max + 1)) - max;
    await Stocks.applyShift(stockId, percent, `random-${volatility}`);
    this.render();
  }

  /** Roll-ALL: applies the same volatility-tier logic as #onShiftStockRandom
   *  to every stock in one economy, one at a time so each stock still gets
   *  its own independent random roll (not one shared percent for all). */
  static async #onShiftEconomyStocksRandom(event, target) {
    const { economyId, volatility } = target.dataset;
    const max = VOLATILITY_LEVELS[volatility];
    if (max === undefined) return;
    const stocks = Stocks.getAll().filter(s => s.economyId === economyId);
    if (!stocks.length) return;
    for (const stock of stocks) {
      const percent = Math.floor(Math.random() * (2 * max + 1)) - max;
      await Stocks.applyShift(stock.id, percent, `random-${volatility}`);
    }
    this.render();
  }

  /** GM "view as player" — opens the same PlayerFinanceApp any player would use. */
  static async #onViewActorFinances(event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    if (!actor) return;
    new PlayerFinanceApp(actor).render(true);
  }

  static async #onOpenTransactionLog() {
    new TransactionLogApp().render(true);
  }

  /** One-shot pull of economies/stocks/wallets/accounts/portfolios from the legacy module. */
  static async #onImportLegacyData() {
    if (!LegacyImporter.isLegacyAvailable()) {
      ui.notifications.error(game.i18n.localize("financial-system-lite.import.legacyNotActive"));
      return;
    }

    const p = LegacyImporter.preview();
    const warningLine = p.multiCurrencyActors > 0
      ? `<p class="fsl-import-warning">${game.i18n.format("financial-system-lite.import.multiCurrencyWarning", { count: p.multiCurrencyActors })}</p>`
      : "";

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("financial-system-lite.import.title") },
      content: `
        <p>${game.i18n.localize("financial-system-lite.import.previewIntro")}</p>
        <ul>
          <li>${game.i18n.format("financial-system-lite.import.previewEconomies", { count: p.economies })}</li>
          <li>${game.i18n.format("financial-system-lite.import.previewBanks", { count: p.banks })}</li>
          <li>${game.i18n.format("financial-system-lite.import.previewStocks", { count: p.stocks })}</li>
          <li>${game.i18n.format("financial-system-lite.import.previewAccounts", { count: p.accountEntries })}</li>
          <li>${game.i18n.format("financial-system-lite.import.previewWallets", { count: p.walletActors })}</li>
          <li>${game.i18n.format("financial-system-lite.import.previewPortfolios", { count: p.portfolioActorEconomyPairs })}</li>
        </ul>
        ${warningLine}
        <p><strong>${game.i18n.localize("financial-system-lite.import.overwriteWarning")}</strong></p>
      `
    });
    if (!confirmed) return;

    let report;
    try {
      report = await LegacyImporter.run();
    } catch (err) {
      ui.notifications.error(err.message);
      return;
    }

    await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("financial-system-lite.import.doneTitle") },
      content: `
        <ul>
          <li>${game.i18n.format("financial-system-lite.import.resultActors", { count: report.actorsTouched })}</li>
          <li>${game.i18n.format("financial-system-lite.import.resultAccounts", { count: report.accountsImported })}</li>
          <li>${game.i18n.format("financial-system-lite.import.resultWallets", { count: report.walletsImported })}</li>
          <li>${game.i18n.format("financial-system-lite.import.resultPortfolios", { count: report.portfoliosImported })}</li>
          ${report.collapsedMultiCurrencyWallets > 0
            ? `<li>${game.i18n.format("financial-system-lite.import.resultCollapsed", { count: report.collapsedMultiCurrencyWallets })}</li>`
            : ""}
        </ul>
      `,
      ok: { label: game.i18n.localize("financial-system-lite.general.close") }
    });

    this.render();
  }
}
