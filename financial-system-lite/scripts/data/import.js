import { MODULE_ID } from "./wallet.js";
import { Wallet } from "./wallet.js";

const LEGACY_MODULE_ID = "financial-system";

/**
 * One-shot importer from the old "financial-system" module's world settings
 * into this module's schema. Only works while the legacy module is still
 * installed and active (its settings have to be registered for
 * game.settings.get to read them) — this is a bridge, not a permanent
 * dependency. Once you've imported and verified the data, the legacy
 * module can be disabled.
 *
 * Legacy shapes (reverse-engineered from the old module's source):
 *   economies:       [{ id, name, currency, banks: [...], stocks: [...] }]
 *   bankAccounts:    { [key]: { actorId, bankId, economyId, balance, createdAt } }
 *   wallets:         { [actorId]: { balances: { [economyId]: number }, lastUpdated } }
 *   stockPortfolios: { ["{actorId}-{economyId}"]: { [stockId]: quantity } }
 */
export class LegacyImporter {
  static isLegacyAvailable() {
    return game.modules.get(LEGACY_MODULE_ID)?.active ?? false;
  }

  static _readLegacySettings() {
    return {
      economies: game.settings.get(LEGACY_MODULE_ID, "economies") ?? [],
      bankAccounts: game.settings.get(LEGACY_MODULE_ID, "bankAccounts") ?? {},
      wallets: game.settings.get(LEGACY_MODULE_ID, "wallets") ?? {},
      stockPortfolios: game.settings.get(LEGACY_MODULE_ID, "stockPortfolios") ?? {}
    };
  }

  /** Read-only summary so the GM can see what's about to happen before committing. */
  static preview() {
    const legacy = this._readLegacySettings();

    const economies = legacy.economies.length;
    const banks = legacy.economies.reduce((sum, e) => sum + (e.banks?.length ?? 0), 0);
    const stocks = legacy.economies.reduce((sum, e) => sum + (e.stocks?.length ?? 0), 0);
    const accountEntries = Object.keys(legacy.bankAccounts).length;
    const walletActors = Object.keys(legacy.wallets).length;
    const portfolioActorEconomyPairs = Object.keys(legacy.stockPortfolios).length;
    const multiCurrencyActors = Object.values(legacy.wallets)
      .filter(w => Object.keys(w?.balances ?? {}).length > 1).length;

    return { economies, banks, stocks, accountEntries, walletActors, portfolioActorEconomyPairs, multiCurrencyActors };
  }

  /**
   * Executes the import. Overwrites this module's `economies`/`stocks`
   * world settings entirely, and overwrites (not merges) `wallet`,
   * `accounts`, and `portfolio` flags on any actor with matching legacy
   * data. Meant to run once, before players start using the new module.
   */
  static async run() {
    if (!this.isLegacyAvailable()) {
      throw new Error(game.i18n.localize("financial-system-lite.import.legacyNotActive"));
    }
    const legacy = this._readLegacySettings();

    // --- economies + banks (original ids preserved so account/portfolio
    //     references below don't need remapping) ---
    const newEconomies = legacy.economies.map(e => ({
      id: e.id,
      name: e.name ?? game.i18n.localize("financial-system-lite.economy.defaultName"),
      currency: e.currency ?? game.i18n.localize("financial-system-lite.economy.defaultCurrency"),
      banks: (e.banks ?? []).map(b => ({
        id: b.id,
        name: b.name ?? "Bank",
        interestRate: Number(b.interestRate) || 0
      }))
    }));
    await game.settings.set(MODULE_ID, "economies", newEconomies);

    // --- stocks (legacy nests these inside economy.stocks; new schema is flat) ---
    const newStocks = [];
    for (const e of legacy.economies) {
      for (const s of (e.stocks ?? [])) {
        newStocks.push({
          id: s.id,
          economyId: e.id,
          symbol: (s.symbol ?? "STK").toUpperCase().slice(0, 5),
          name: s.name ?? "Stock",
          price: Number(s.currentPrice) || 0,
          trend: Number(s.trendPercentage) || 0,
          sharesAvailable: Number(s.availableShares) || 0,
          totalShares: Number(s.totalShares) || 0,
          history: (s.trendData?.history ?? []).map(h => ({
            t: h.timestamp ?? Date.now(),
            price: h.priceAtTrend ?? s.currentPrice ?? 0
          }))
        });
      }
    }
    await game.settings.set(MODULE_ID, "stocks", newStocks);

    // --- per-actor: wallet, accounts, portfolio ---
    const report = {
      actorsTouched: 0,
      accountsImported: 0,
      walletsImported: 0,
      portfoliosImported: 0,
      collapsedMultiCurrencyWallets: 0
    };

    for (const actor of game.actors) {
      let touched = false;

      // Wallet — legacy is per-economy, this module's wallet is a single
      // flat balance. If an actor only ever used one economy this is
      // lossless; if they used more than one, balances are summed (there's
      // no other sane default without introducing multi-currency wallets).
      const legacyWallet = legacy.wallets[actor.id];
      const legacyBalances = legacyWallet?.balances ?? {};
      const balanceCount = Object.keys(legacyBalances).length;
      if (balanceCount > 0) {
        const total = Object.values(legacyBalances).reduce((sum, v) => sum + (Number(v) || 0), 0);
        await Wallet.setBalance(actor, total);
        report.walletsImported++;
        if (balanceCount > 1) report.collapsedMultiCurrencyWallets++;
        touched = true;
      }

      // Bank accounts
      const accounts = {};
      for (const account of Object.values(legacy.bankAccounts)) {
        if (account.actorId !== actor.id) continue;
        accounts[account.bankId] = { balance: Number(account.balance) || 0, economyId: account.economyId };
        report.accountsImported++;
        touched = true;
      }
      if (Object.keys(accounts).length) {
        await actor.setFlag(MODULE_ID, "accounts", accounts);
      }

      // Stock portfolio — legacy key is "{actorId}-{economyId}"
      const portfolio = {};
      for (const [key, holdings] of Object.entries(legacy.stockPortfolios)) {
        if (!key.startsWith(`${actor.id}-`)) continue;
        for (const [stockId, qty] of Object.entries(holdings)) {
          if (Number(qty) > 0) portfolio[stockId] = (portfolio[stockId] || 0) + Number(qty);
        }
      }
      if (Object.keys(portfolio).length) {
        await actor.setFlag(MODULE_ID, "portfolio", portfolio);
        report.portfoliosImported++;
        touched = true;
      }

      if (touched) report.actorsTouched++;
    }

    return report;
  }
}
