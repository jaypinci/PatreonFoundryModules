/**
 * vendit.js — VENDIT Automated Retail Terminal v1.0.3
 *
 * ApplicationV2 / DocumentSheetV2 port.
 */

const MODULE_ID = "vendit";
let socket = null;

class VenditCategoryConfig extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "vendit-category-config",
    classes: ["vendit-window"],
    tag: "form",
    position: { width: 440, height: "auto" },
    window: { title: "VENDIT.Settings.Categories.Name", resizable: true },
    form: {
      handler: VenditCategoryConfig.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true,
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/vendit-category-config.html` },
  };

  async _prepareContext() {
    const categories = game.settings.get(MODULE_ID, "categories");
    return { categories: categories.join("\n") };
  }

  static async #onSubmit(_event, _form, formData) {
    const raw = formData.object.categories ?? "";
    const list = [...new Set(raw.split("\n").map((s) => s.trim()).filter(Boolean))];
    await game.settings.set(MODULE_ID, "categories", list);
    ui.notifications.info("VENDIT: Category list updated.");
    for (const app of foundry.applications.instances.values()) {
      if (app instanceof VenditShopSheet) app.render(false);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Foundry init
// ─────────────────────────────────────────────────────────────
Hooks.once("init", () => {
  foundry.documents.collections.Actors.registerSheet("vendit", VenditShopSheet, {
    types: ["npc", "character"],
    makeDefault: false,
    label: "VENDIT Shop Terminal",
  });
  Handlebars.registerHelper("lte", (a, b) => Number(a) <= Number(b));

  game.settings.register(MODULE_ID, "categories", {
    scope: "world",
    config: false,
    type: Array,
    default: ["Weapons", "Armor", "Cyberware", "Drugs & Chems", "Gear", "Vehicles", "Drones", "Programs", "Consumables", "Misc"],
  });
  game.settings.registerMenu(MODULE_ID, "categoryConfigMenu", {
    name: "VENDIT.Settings.Categories.Name",
    label: "VENDIT.Settings.Categories.Label",
    hint: "VENDIT.Settings.Categories.Hint",
    icon: "fas fa-tags",
    type: VenditCategoryConfig,
    restricted: true,
  });
});

// ─────────────────────────────────────────────────────────────
// Ready — register socketlib handlers
// ─────────────────────────────────────────────────────────────
Hooks.once("ready", () => {
  if (typeof socketlib === "undefined" || !socketlib) {
    console.error("[VENDIT] socketlib not loaded.");
    ui.notifications?.error("VENDIT: socketlib missing — purchases won't work.");
    return;
  }
  try {
    socket = socketlib.registerModule(MODULE_ID);
    socket.register("requestPurchase",   handlePurchaseRequest);
    socket.register("requestMysteryBox", handleMysteryBoxRequest);
    console.log(`[VENDIT] Socketlib ready on ${game.user.isGM ? "GM" : "player"} client.`);
  } catch (err) {
    console.error("[VENDIT] Failed to register socketlib:", err);
    ui.notifications?.error("VENDIT: Socket init failed.");
  }
});

// ─────────────────────────────────────────────────────────────
// GM handler — standard purchase
// ─────────────────────────────────────────────────────────────
async function handlePurchaseRequest({ buyerActorId, shopActorId, itemId, effectivePrice }) {
  if (!game.user?.isGM) return { success: false, message: "GM only." };
  try {
    const buyer = game.actors.get(buyerActorId);
    const shop  = game.actors.get(shopActorId);
    if (!buyer) throw new Error("Buyer actor not found.");
    if (!shop)  throw new Error("Shop actor not found.");
    const item  = shop.items.get(itemId);
    if (!item)  throw new Error("Item not found in shop.");
    const price = Number(effectivePrice ?? item.system.cost ?? 0);
    if (price > 0) {
      const fsl = game.modules.get("financial-system-lite")?.api;
      if (!fsl) throw new Error("financial-system-lite module is not active.");
      const balance = fsl.getWalletBalance(buyer);
      if (balance < price) throw new Error(`${buyer.name} has insufficient funds (need ${price} CR).`);
      await fsl.adjustWallet(buyer, -price, { type: "vendorPurchase", source: "VENDIT", itemName: item.name });
    }
    const itemData = item.toObject();
    itemData.system.quantity = 1;
    await Item.create(itemData, { parent: buyer });
    const shopQty = Number(item.system.quantity) || 1;
    if (shopQty > 1) await item.update({ "system.quantity": shopQty - 1 });
    else             await item.delete();
    const priceLabel = price > 0 ? `for ${price} CR` : "FREE";
    ui.notifications.info(`${buyer.name} purchased ${item.name} ${priceLabel}.`);
    if (buyer.sheet?.rendered) buyer.sheet.render(false);
    if (shop.sheet?.rendered)  shop.sheet.render(false);
    return { success: true, message: `${item.name} dispensed.` };
  } catch (err) {
    console.error("[VENDIT] Purchase failed:", err);
    ui.notifications.error(`VENDIT: ${err.message}`);
    return { success: false, message: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// GM handler — Mystery Box
// ─────────────────────────────────────────────────────────────
async function handleMysteryBoxRequest({ buyerActorId, shopActorId }) {
  if (!game.user?.isGM) return { success: false, message: "GM only." };
  const COST = 100;
  try {
    const buyer = game.actors.get(buyerActorId);
    const shop  = game.actors.get(shopActorId);
    if (!buyer) throw new Error("Buyer actor not found.");
    if (!shop)  throw new Error("Shop actor not found.");
    const fsl = game.modules.get("financial-system-lite")?.api;
    if (!fsl) throw new Error("financial-system-lite module is not active.");
    const balance = fsl.getWalletBalance(buyer);
    if (balance < COST) throw new Error(`${buyer.name} needs ${COST} CR for the Mystery Box.`);
    await fsl.adjustWallet(buyer, -COST, { type: "vendorPurchase", source: "VENDIT", itemName: "Mystery Box" });
    const roll = Math.random() * 100;
    let tier, minItemValue, maxItemValue, itemCount;
    if      (roll < 75.0) { tier = 1; minItemValue = 1;    maxItemValue = 50;     itemCount = 1; }
    else if (roll < 90.0) { tier = 2; minItemValue = 51;   maxItemValue = 100;    itemCount = Math.random() < 0.5 ? 1 : 2; }
    else if (roll < 95.0) { tier = 3; minItemValue = 101;  maxItemValue = 500;    itemCount = 2; }
    else if (roll < 98.0) { tier = 4; minItemValue = 501;  maxItemValue = 1000;   itemCount = Math.random() < 0.5 ? 2 : 3; }
    else if (roll < 99.5) { tier = 5; minItemValue = 1001; maxItemValue = 2500;   itemCount = 3; }
    else                  { tier = 6; minItemValue = 2501; maxItemValue = 999999; itemCount = 3; }
    const items = [];
    for (let i = 0; i < itemCount; i++) {
      const inStock = shop.items.contents.filter(it => Number(it.system.quantity ?? 0) > 0);
      let eligible  = inStock.filter(it => { const c = Number(it.system.cost ?? 0); return c >= minItemValue && c <= maxItemValue; });
      if (!eligible.length) {
        for (const fallback of [maxItemValue, maxItemValue / 2, minItemValue, 1]) {
          eligible = inStock.filter(it => { const c = Number(it.system.cost ?? 0); return c <= fallback && c > 0; });
          if (eligible.length) break;
        }
      }
      if (!eligible.length) eligible = inStock;
      if (eligible.length > 0) items.push(eligible[Math.floor(Math.random() * eligible.length)]);
    }
    if (!items.length) throw new Error("Shop has no items in stock for the Mystery Box.");
    for (const item of items) {
      const itemData = item.toObject();
      itemData.system.quantity = 1;
      await Item.create(itemData, { parent: buyer });
      const shopQty = Number(item.system.quantity) || 1;
      if (shopQty > 1) await item.update({ "system.quantity": shopQty - 1 });
      else             await item.delete();
    }
    if (buyer.sheet?.rendered) buyer.sheet.render(false);
    if (shop.sheet?.rendered)  shop.sheet.render(false);
    return {
      success: true,
      items:   items.map(it => ({ name: it.name, img: it.img, value: Number(it.system.cost ?? 0) })),
      itemCount: items.length,
      totalValue: items.reduce((s, it) => s + Number(it.system.cost ?? 0), 0),
      tier,
    };
  } catch (err) {
    console.error("[VENDIT] Mystery box failed:", err);
    ui.notifications.error(`VENDIT: ${err.message}`);
    return { success: false, message: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Lucky Spin table
// ─────────────────────────────────────────────────────────────
const SPIN_TABLE = [
  { w: 25,   type: "flat_off",  label: "5 CR OFF next purchase",            value: 5      },
  { w: 20,   type: "flat_off",  label: "10 CR OFF next purchase",           value: 10     },
  { w: 15,   type: "flat_off",  label: "15 CR OFF next purchase",           value: 15     },
  { w: 12,   type: "flat_off",  label: "25 CR OFF next purchase",           value: 25     },
  { w: 10,   type: "flat_off",  label: "50 CR OFF next purchase",           value: 50     },
  { w:  8,   type: "pct_off",   label: "5% OFF next purchase",              value: 5      },
  { w:  5,   type: "pct_off",   label: "10% OFF next purchase",             value: 10     },
  { w:  3,   type: "free_item", label: "FREE item under 25 CR",             value: 25     },
  { w:  1,   type: "free_item", label: "FREE item under 50 CR",             value: 50     },
  { w:  0.5, type: "free_item", label: "FREE item under 100 CR",            value: 100    },
  { w:  0.3, type: "flat_off",  label: "100 CR OFF next purchase",          value: 100    },
  { w:  0.2, type: "pct_off",   label: "25% OFF next purchase",             value: 25     },
  { w:  0.1, type: "free_item", label: "FREE item under 250 CR",            value: 250    },
  { w:  0.1, type: "flat_off",  label: "250 CR OFF next purchase",          value: 250    },
  { w:  0.05,type: "jackpot",   label: "JACKPOT — FREE any item in vendit", value: 999999 },
];
const SPIN_TOTAL = SPIN_TABLE.reduce((s, e) => s + e.w, 0);
function rollSpin() {
  let r = Math.random() * SPIN_TOTAL;
  for (const entry of SPIN_TABLE) { r -= entry.w; if (r <= 0) return { ...entry }; }
  return { ...SPIN_TABLE[0] };
}

// ─────────────────────────────────────────────────────────────
// VenditShopSheet — ApplicationV2 / DocumentSheetV2
// ─────────────────────────────────────────────────────────────
const { HandlebarsApplicationMixin, DocumentSheetV2 } = foundry.applications.api;

class VenditShopSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {

  static DEFAULT_OPTIONS = {
    id:       "vendit-shop",
    classes:  ["vendit-window"],
    position: { width: 820, height: 640 },
    window: {
      resizable: true,
      title:     "VENDIT",   // overridden per-actor via get title
    },
    form: {
      submitOnChange: false,
      closeOnSubmit:  false,
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/vendit-sheet.html` },
  };

  get title() { return `VENDIT — ${this.document.name}`; }

  constructor(options = {}) {
    super(options);
    this._selectedItemId   = null;
    this._selectedBuyerId  = null;
    this._surgeActive      = false;
    this._surgePercent     = 0;
    this._coupon           = null;
    this._selectedCategory = "";
  }

  // ── Context (replaces getData) ─────────────────────────────
  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);

    let inventory = this.document.items.contents.slice();
    if (this._selectedCategory) {
      inventory = inventory.filter(item => {
        return (item.getFlag(MODULE_ID, "category") || "") === this._selectedCategory;
      });
    }
    ctx.inventory        = inventory.sort((a, b) => a.name.localeCompare(b.name));
    ctx.actorList        = (game.actors?.contents ?? [])
      .filter(a => a.type !== "vehicle" && a.hasPlayerOwner)
      .map(a => ({ id: a.id, name: a.name }));
    ctx.system           = this.document.system;
    ctx.surgeActive      = this._surgeActive;
    ctx.isGM             = game.user?.isGM ?? false;
    ctx.selectedCategory = this._selectedCategory;
    ctx.categories       = game.settings.get(MODULE_ID, "categories");
    return ctx;
  }

  // ── Wire listeners after each render ──────────────────────
  _onRender(context, options) {
    const root = this.element;
    this._setupTabs(root);
    this._setupCategory(root);
    this._setupSearch(root);
    this._setupItemRows(root);
    this._setupBuyer(root);
    this._setupDispenseBtn(root);
    this._setupSurge(root);
    this._setupSpin(root);
    this._setupMysteryBox(root);
    this._updateStatusBar(root);
    this._restoreState(root);
  }

  // ── Tabs ───────────────────────────────────────────────────
  _setupTabs(root) {
    root.querySelectorAll(".vendit-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const t = tab.dataset.vtab;
        root.querySelectorAll(".vendit-tab").forEach(x => x.classList.toggle("v-active", x.dataset.vtab === t));
        root.querySelectorAll(".v-panel").forEach(p => p.classList.toggle("v-active", p.dataset.vpanel === t));
      });
    });
  }

  // ── Category ───────────────────────────────────────────────
  _setupCategory(root) {
    const sel = root.querySelector("#vd-category");
    if (sel) {
      sel.value = this._selectedCategory;
      sel.addEventListener("change", () => { this._selectedCategory = sel.value; this.render(false); });
    }
    root.querySelector("#vd-configure-categories")?.addEventListener("click", () => {
      new VenditCategoryConfig().render(true);
    });
  }

  // ── Search ─────────────────────────────────────────────────
  _setupSearch(root) {
    const input    = root.querySelector(".vendit-search");
    const clearBtn = root.querySelector(".vendit-search-clear");
    if (!input) return;
    input.addEventListener("input", () => this._filterRows(input.value.trim().toLowerCase(), root));
    clearBtn?.addEventListener("click", () => { input.value = ""; this._filterRows("", root); input.focus(); });
  }

  _filterRows(term, root) {
    let visible = 0;
    root.querySelectorAll(".vendit-item-row").forEach(row => {
      const name = row.querySelector(".vendit-row-name")?.textContent.toLowerCase() ?? "";
      const show = !term || name.includes(term);
      row.style.display = show ? "" : "none";
      if (show) visible++;
    });
    const list = root.querySelector("#vendit-list");
    list?.querySelector(".v-no-match")?.remove();
    if (visible === 0 && term && list) {
      const el = document.createElement("div");
      el.className = "vendit-list-empty v-no-match";
      el.innerHTML = `<div class="vendit-list-empty-icon">⬡</div><div class="vendit-list-empty-text">NO MATCHING PRODUCTS</div>`;
      list.appendChild(el);
    }
  }

  // ── Item rows ──────────────────────────────────────────────
  _setupItemRows(root) {
    root.querySelectorAll(".vendit-item-row").forEach(row => {
      row.addEventListener("click", e => {
        if (e.target.classList.contains("vendit-row-btn") || e.target.closest(".vendit-delete-btn") || e.target.closest(".vendit-category-btn")) return;
        this._selectItem(row.dataset.itemId, root);
      });
    });
    root.querySelectorAll(".vendit-row-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        this._selectItem(btn.dataset.itemId, root);
        this._executePurchase(btn.dataset.itemId, root);
      });
    });
    root.querySelectorAll(".vendit-delete-btn").forEach(btn => {
      btn.addEventListener("click", e => { e.stopPropagation(); this._deleteItem(btn.dataset.itemId, root); });
    });
    root.querySelectorAll(".vendit-category-btn").forEach(btn => {
      btn.addEventListener("click", e => { e.stopPropagation(); this._assignCategory(btn.dataset.itemId, root); });
    });
  }

  _selectItem(itemId, root) {
    this._selectedItemId = itemId;
    root.querySelectorAll(".vendit-item-row").forEach(r => r.classList.toggle("v-selected", r.dataset.itemId === itemId));
    this._renderDetailPanel(itemId, root);
    this._refreshDispenseBtn(root);
  }

  // ── Detail panel ───────────────────────────────────────────
  _renderDetailPanel(itemId, root) {
    const item    = itemId ? this.document.items.get(itemId) : null;
    const nameEl  = root.querySelector("#vd-name");
    const imgEl   = root.querySelector("#vd-img");
    const holdEl  = root.querySelector("#vd-placeholder");
    const statsEl = root.querySelector("#vd-stats");
    const descEl  = root.querySelector("#vd-desc");
    const priceEl = root.querySelector("#vd-price");
    const qtyEl   = root.querySelector("#vd-qty");
    const encEl   = root.querySelector("#vd-enc");
    const condEl  = root.querySelector("#vd-cond");

    if (!item) {
      if (nameEl)  nameEl.innerHTML = `<span class="vendit-detail-name-placeholder">← SELECT AN ITEM</span>`;
      if (imgEl)   imgEl.style.display = "none";
      if (holdEl)  holdEl.style.display = "flex";
      if (statsEl) statsEl.style.display = "none";
      if (descEl)  descEl.innerHTML = `<span class="vendit-desc-placeholder">No item selected.</span>`;
      return;
    }

    if (nameEl) nameEl.textContent = item.name;
    const hasImg = item.img && !item.img.includes("item-bag.svg");
    if (hasImg) {
      if (imgEl)  { imgEl.src = item.img; imgEl.alt = item.name; imgEl.style.display = "block"; }
      if (holdEl) holdEl.style.display = "none";
    } else {
      if (imgEl)  imgEl.style.display = "none";
      if (holdEl) holdEl.style.display = "flex";
    }
    if (statsEl) statsEl.style.display = "grid";
    const baseCost = Number(item.system.cost ?? 0);
    const effCost  = this._effectivePrice(baseCost);
    const qty      = Number(item.system.quantity ?? 0);
    const enc      = item.system.enc ?? item.system.encumbrance ?? "—";
    if (priceEl) {
      priceEl.textContent = `${effCost} CR`;
      priceEl.className   = "vendit-stat-val gold" + (effCost < baseCost ? " discounted" : effCost > baseCost ? " surged" : "");
    }
    if (qtyEl)  { qtyEl.textContent = `×${qty}`; qtyEl.className = "vendit-stat-val" + (qty === 0 ? " red" : qty <= 2 ? "" : " green"); }
    if (encEl)  encEl.textContent = enc;
    if (condEl) { condEl.textContent = qty > 0 ? "AVAILABLE" : "OUT OF STOCK"; condEl.className = "vendit-stat-val" + (qty > 0 ? " green" : " red"); }
    if (descEl) {
      const raw   = item.system.description?.value ?? item.system.description ?? "";
      const plain = typeof raw === "string" ? raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
      descEl.innerHTML = plain ? `<p>${plain}</p>` : `<span class="vendit-desc-placeholder">No product information on file.</span>`;
    }
  }

  // ── Pricing helpers ────────────────────────────────────────
  _effectivePrice(baseCost) {
    let price = baseCost;
    if (this._surgeActive && this._surgePercent > 0)
      price = Math.ceil(price * (1 + this._surgePercent / 100));
    if (this._coupon) {
      const c = this._coupon;
      if      (c.type === "pct_off")  price = Math.max(0, Math.floor(price * (1 - c.value / 100)));
      else if (c.type === "flat_off") price = Math.max(0, price - c.value);
      else if (c.type === "free_item" || c.type === "jackpot") if (baseCost <= c.value) price = 0;
    }
    return price;
  }

  _applyPricesToList(root) {
    root.querySelectorAll(".vendit-row-cost[data-base]").forEach(el => {
      const base = Number(el.dataset.base ?? 0);
      const eff  = this._effectivePrice(base);
      el.textContent = `${eff} CR`;
      el.className   = "vendit-row-cost" + (eff < base ? " discounted" : eff > base ? " surged" : "");
    });
    if (this._selectedItemId) this._renderDetailPanel(this._selectedItemId, root);
    this._refreshDispenseBtn(root);
  }

  // ── Buyer ──────────────────────────────────────────────────
  _setupBuyer(root) {
    const sel = root.querySelector("#vd-buyer");
    if (!sel) return;
    sel.addEventListener("change", () => {
      this._selectedBuyerId = sel.value || null;
      this._updateBalance(root);
      this._refreshDispenseBtn(root);
    });
  }

  _updateBalance(root) {
    const valEl   = root.querySelector("#vd-balance");
    if (!valEl) return;
    const buyerId = root.querySelector("#vd-buyer")?.value;
    if (!buyerId) { valEl.textContent = "— CR"; valEl.className = "vendit-balance-val"; return; }
    try {
      const buyerActor = game.actors.get(buyerId);
      const fsl   = game.modules.get("financial-system-lite")?.api;
      const total = buyerActor && fsl ? fsl.getWalletBalance(buyerActor) : 0;
      const item  = this._selectedItemId ? this.document.items.get(this._selectedItemId) : null;
      const eff     = item ? this._effectivePrice(Number(item.system.cost ?? 0)) : 0;
      valEl.textContent = `${total.toLocaleString()} CR`;
      valEl.className   = "vendit-balance-val" + (eff > 0 && total < eff ? " broke" : "");
    } catch { valEl.textContent = "N/A"; valEl.className = "vendit-balance-val"; }
  }

  // ── Dispense ───────────────────────────────────────────────
  _setupDispenseBtn(root) {
    root.querySelector("#vd-dispense")
      ?.addEventListener("click", () => this._executePurchase(this._selectedItemId, root));
  }

  _refreshDispenseBtn(root) {
    const btn     = root.querySelector("#vd-dispense");
    const effRow  = root.querySelector("#vd-eff-row");
    const effLbl  = root.querySelector("#vd-eff-lbl");
    const effVal  = root.querySelector("#vd-eff-val");
    const buyerId = root.querySelector("#vd-buyer")?.value;
    const item    = this._selectedItemId ? this.document.items.get(this._selectedItemId) : null;
    const qty     = item ? Number(item.system.quantity ?? 0) : 0;
    const base    = item ? Number(item.system.cost ?? 0) : 0;
    const eff     = item ? this._effectivePrice(base) : 0;
    const canBuy  = !!(socket && buyerId && item && qty > 0);
    if (btn) btn.disabled = !canBuy;
    if (item && eff !== base && effRow) {
      effRow.style.display = "flex";
      const isSurge = eff > base;
      if (effLbl) effLbl.textContent = isSurge ? "SURGE PRICE" : "COUPON PRICE";
      if (effVal) { effVal.textContent = `${eff} CR`; effVal.className = "vendit-eff-val" + (eff < base ? " discounted" : " surged"); }
    } else if (effRow) {
      effRow.style.display = "none";
    }
    this._updateBalance(root);
  }

  async _executePurchase(itemId, root) {
    const buyerId = root.querySelector("#vd-buyer")?.value;
    if (!itemId)  { ui.notifications.warn("VENDIT: No product selected.");         return; }
    if (!buyerId) { ui.notifications.warn("VENDIT: No account selected.");         return; }
    if (!socket)  { ui.notifications.error("VENDIT: Network error — no socket."); return; }
    const item = this.document.items.get(itemId);
    if (!item)    { ui.notifications.warn("VENDIT: Item no longer available.");    return; }
    const base = Number(item.system.cost ?? 0);
    const eff  = this._effectivePrice(base);
    let couponUsed = false;
    if (this._coupon) {
      const c = this._coupon;
      couponUsed = c.type === "pct_off" || c.type === "flat_off" || c.type === "jackpot" || (c.type === "free_item" && base <= c.value);
    }
    this._showOverlay(root, "PROCESSING TRANSACTION");
    try {
      const result = await socket.executeAsGM("requestPurchase", {
        buyerActorId:   buyerId,
        shopActorId:    this.document.id,
        itemId,
        effectivePrice: eff,
      });
      this._hideOverlay(root);
      if (result.success) {
        this._flashRoot(root, "ok");
        ui.notifications.info(`✔ ${result.message}`);
        if (couponUsed) { this._coupon = null; this._updateCouponUI(root); }
      } else {
        this._flashRoot(root, "err");
        ui.notifications.error(`✘ ${result.message}`);
      }
    } catch (err) {
      this._hideOverlay(root);
      this._flashRoot(root, "err");
      console.error("[VENDIT] Socket error:", err);
      ui.notifications.error("VENDIT: Socket error — " + (err.message ?? "unknown"));
    }
  }

  // ── Category assignment ────────────────────────────────────
  async _assignCategory(itemId, root) {
    if (!game.user?.isGM) { ui.notifications.error("VENDIT: Only GMs can assign categories."); return; }
    const item = this.document.items.get(itemId);
    if (!item) { ui.notifications.warn("VENDIT: Item no longer exists."); return; }
    const currentCategory = item.getFlag(MODULE_ID, "category") || "";
    const categories = ["", ...game.settings.get(MODULE_ID, "categories")];
    const content = `
      <div style="font-family:'Share Tech Mono',monospace;color:#9eccd8;text-align:center;padding:8px;background:#020509;border-radius:4px">
        <div style="font-family:'Orbitron',monospace;font-size:14px;color:#00e8ff;letter-spacing:0.18em;margin-bottom:10px">ASSIGN CATEGORY</div>
        <div style="font-size:12px;line-height:1.6;color:#6a9aaa;margin-bottom:12px">Select category for <strong style="color:#00e8ff">${item.name}</strong></div>
        <select id="vendit-category-select" style="width:100%;padding:6px;background:#010810;border:1px solid #00e8ff44;color:#00e8ff;font-family:'Share Tech Mono',monospace;font-size:11px;border-radius:2px;color-scheme:dark">
          ${categories.map(cat => `<option value="${cat}" ${cat === currentCategory ? "selected" : ""}>${cat || "Uncategorized"}</option>`).join("")}
        </select>
      </div>`;
    return new Promise(resolve => {
      new Dialog({
        title: "VENDIT — Assign Category", content,
        buttons: {
          save:   { label: "ASSIGN", callback: html => { const s = html[0]?.querySelector("#vendit-category-select"); if (s) { item.setFlag(MODULE_ID, "category", s.value); this.render(false); } resolve(); } },
          cancel: { label: "CANCEL", callback: () => resolve() },
        },
        default: "save", close: () => resolve(),
      }).render(true);
    });
  }

  // ── Delete item ────────────────────────────────────────────
  async _deleteItem(itemId, root) {
    if (!game.user?.isGM) { ui.notifications.error("VENDIT: Only GMs can remove items."); return; }
    const item = this.document.items.get(itemId);
    if (!item) { ui.notifications.warn("VENDIT: Item no longer exists."); return; }
    const confirmed = await Dialog.confirm({
      title:   "REMOVE ITEM FROM INVENTORY",
      content: `<p>Remove <strong>${item.name}</strong> from ${this.document.name}'s inventory? This cannot be undone.</p>`,
    });
    if (!confirmed) return;
    try {
      await item.delete();
      ui.notifications.info(`VENDIT: ${item.name} removed from inventory.`);
      if (this._selectedItemId === itemId) { this._selectedItemId = null; this._renderDetailPanel(null, root); }
      this.render(false);
    } catch (err) {
      console.error("[VENDIT] Delete failed:", err);
      ui.notifications.error(`VENDIT: Failed to remove item — ${err.message}`);
    }
  }

  // ── Surge pricing ──────────────────────────────────────────
  _setupSurge(root) {
    root.querySelector("#vd-surge-btn")?.addEventListener("click", () => {
      this._surgeActive = !this._surgeActive;
      if (this._surgeActive) {
        this._surgePercent = Math.floor(Math.random() * 12) + 1;
        ui.notifications.warn(`⚡ SURGE PRICING ACTIVE: +${this._surgePercent}%`);
      } else {
        this._surgePercent = 0;
        ui.notifications.info("Surge pricing deactivated.");
      }
      this._updateSurgeUI(root);
      this._applyPricesToList(root);
    });
  }

  _updateSurgeUI(root) {
    const btn   = root.querySelector("#vd-surge-btn");
    const badge = root.querySelector("#vd-surge-badge");
    const pctEl = root.querySelector("#vd-surge-pct");
    if (btn) { btn.innerHTML = `<i class="fas fa-bolt"></i> ${this._surgeActive ? "SURGE ON" : "SURGE"}`; btn.classList.toggle("surge-on", this._surgeActive); }
    if (badge) badge.style.display = this._surgeActive ? "flex" : "none";
    if (pctEl) pctEl.textContent   = `+${this._surgePercent}%`;
    const ticker = root.querySelector("#vd-ticker");
    if (ticker) {
      ticker.querySelector(".surge-tick")?.remove();
      if (this._surgeActive) {
        const sp = document.createElement("span"); sp.className = "surge-tick";
        sp.textContent = `⚡ DYNAMIC SURGE PRICING IN EFFECT — +${this._surgePercent}%`;
        ticker.prepend(sp);
      }
    }
  }

  // ── Lucky Spin ─────────────────────────────────────────────
  _setupSpin(root) {
    root.querySelector("#vd-spin-btn")?.addEventListener("click", () => this._doLuckySpin(root));
    root.querySelector("#vd-coupon-dismiss")?.addEventListener("click", () => {
      this._coupon = null; this._updateCouponUI(root); this._applyPricesToList(root);
    });
  }

  async _doLuckySpin(root) {
    if (this._coupon) { ui.notifications.warn("VENDIT: You already have an active coupon — use it first!"); return; }
    const outcome = rollSpin();
    await this._showSpinDialog(outcome);
    this._coupon = outcome;
    this._updateCouponUI(root);
    this._applyPricesToList(root);
  }

  _updateCouponUI(root) {
    const strip   = root.querySelector("#vd-coupon-strip");
    const labelEl = root.querySelector("#vd-coupon-label");
    if (!strip) return;
    if (this._coupon) { strip.style.display = "flex"; if (labelEl) labelEl.textContent = `🎟 ${this._coupon.label}`; }
    else strip.style.display = "none";
    this._refreshDispenseBtn(root);
  }

  async _showSpinDialog(outcome) {
    const isJackpot = outcome.type === "jackpot";
    const color     = isJackpot ? "#ffd000" : outcome.type === "free_item" ? "#00ff88" : "#00e8ff";
    const symbols   = ["🎯","💎","⭐","🔥","⚡","🎲","💰","🎰","✦","◆","★","◈"];
    const finalSym  = isJackpot ? ["⭐","⭐","⭐"] : ["◆","◆","◆"];
    const content = `
      <div style="font-family:'Share Tech Mono',monospace;text-align:center;padding:10px;background:#020509;border-radius:4px;min-width:280px">
        <div style="font-family:'Orbitron',monospace;font-size:15px;letter-spacing:0.25em;color:#00e8ff;text-shadow:0 0 8px #00e8ff;margin-bottom:12px">LUCKY SPIN TERMINAL</div>
        <div style="display:flex;gap:8px;justify-content:center;margin-bottom:14px">
          <div id="reel-0" style="width:62px;height:62px;border:1px solid #00e8ff44;border-radius:4px;background:#010810;display:flex;align-items:center;justify-content:center;font-size:30px;transition:border-color 0.3s,box-shadow 0.3s">?</div>
          <div id="reel-1" style="width:62px;height:62px;border:1px solid #00e8ff44;border-radius:4px;background:#010810;display:flex;align-items:center;justify-content:center;font-size:30px;transition:border-color 0.3s,box-shadow 0.3s">?</div>
          <div id="reel-2" style="width:62px;height:62px;border:1px solid #00e8ff44;border-radius:4px;background:#010810;display:flex;align-items:center;justify-content:center;font-size:30px;transition:border-color 0.3s,box-shadow 0.3s">?</div>
        </div>
        <div id="spin-result" style="opacity:0;transition:opacity 0.5s;margin-bottom:4px">
          <div style="font-size:13px;letter-spacing:0.12em;color:${color};font-weight:700;margin-bottom:4px">${outcome.label}</div>
          <div style="font-size:10px;color:#3a6672;letter-spacing:0.18em">${isJackpot ? "⚡ JACKPOT ⚡" : "Coupon applied to your next purchase"}</div>
        </div>
      </div>`;
    return new Promise(resolve => {
      const d = new Dialog({
        title: "VENDIT — LUCKY SPIN", content,
        buttons: { ok: { label: "CLAIM COUPON", callback: resolve } },
        default: "ok",
        render: htmlEl => {
          const el     = htmlEl instanceof HTMLElement ? htmlEl : htmlEl[0];
          const reels  = [0,1,2].map(i => el.querySelector(`#reel-${i}`));
          const result = el.querySelector("#spin-result");
          let ticks = 0; const maxTicks = 24;
          const iv = setInterval(() => {
            ticks++;
            reels.forEach((r, i) => {
              if (!r) return;
              if (ticks < maxTicks - i * 4) { r.textContent = symbols[Math.floor(Math.random() * symbols.length)]; }
              else if (!r.dataset.locked) {
                r.textContent = finalSym[i]; r.dataset.locked = "1";
                r.style.borderColor = color; r.style.boxShadow = `0 0 12px ${color}66`; r.style.color = color;
              }
            });
            if (ticks >= maxTicks + 3) { clearInterval(iv); if (result) result.style.opacity = "1"; }
          }, 75);
        },
      });
      d.render(true);
    });
  }

  // ── Mystery Box ────────────────────────────────────────────
  _setupMysteryBox(root) {
    root.querySelector("#vd-mystery-btn")?.addEventListener("click", () => this._doMysteryBox(root));
  }

  async _doMysteryBox(root) {
    const buyerId = root.querySelector("#vd-buyer")?.value;
    if (!buyerId) { ui.notifications.warn("VENDIT: Select an account first."); return; }
    if (!socket)  { ui.notifications.error("VENDIT: No socket."); return; }
    const confirmed = await Dialog.confirm({
      title:   "MYSTERY BOX — 100 CR",
      content: `<p>Spend 100 CR on a Mystery Box? Contents unknown until dispensed.</p>`,
    });
    if (!confirmed) return;
    this._showOverlay(root, "RANDOMIZING CONTENTS...");
    try {
      const result = await socket.executeAsGM("requestMysteryBox", { buyerActorId: buyerId, shopActorId: this.document.id });
      this._hideOverlay(root);
      if (result.success) { this._flashRoot(root, "ok"); await this._showMysteryReveal(result); }
      else { this._flashRoot(root, "err"); ui.notifications.error(`✘ ${result.message}`); }
    } catch (err) {
      this._hideOverlay(root); this._flashRoot(root, "err");
      console.error("[VENDIT] Mystery box error:", err);
      ui.notifications.error("VENDIT: " + (err.message ?? "Socket error"));
    }
  }

  async _showMysteryReveal({ items, itemCount, totalValue, tier }) {
    const tData = [null,
      { label: "COMMON HAUL",   color: "#00e8ff" },
      { label: "QUALITY FIND",  color: "#00ff88" },
      { label: "RARE SCORE",    color: "#ffd000" },
      { label: "EXCEPTIONAL",   color: "#ff8800" },
      { label: "LEGENDARY",     color: "#ff00aa" },
      { label: "MYTHIC HAUL",   color: "#ffffff" },
    ];
    const { label, color } = tData[tier] ?? { label: "MYSTERY ITEM", color: "#00e8ff" };
    await new Promise(resolve => {
      const d = new Dialog({
        title: `MYSTERY BOX REVEAL${itemCount > 1 ? ` — ${itemCount} ITEMS` : ""}`,
        content: `
          <div style="font-family:'Share Tech Mono',monospace;text-align:center;padding:14px;background:#020509;border-radius:4px;min-height:280px">
            <div id="box-stage" style="position:relative;height:200px;margin-bottom:10px">
              <div id="mystery-box" style="font-size:80px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transition:all 0.3s ease">📦</div>
              <div id="particles" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none"></div>
              <div id="reveal-content" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0;transition:opacity 0.8s ease">
                <div id="items-display" style="display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;max-width:200px">
                  ${items.map(item => {
                    const hasImg = item.img && !item.img.includes("item-bag.svg");
                    return hasImg ? `<img src="${item.img}" style="width:${itemCount > 2 ? "40px" : "60px"};height:${itemCount > 2 ? "40px" : "60px"};object-fit:contain;filter:drop-shadow(0 0 8px ${color})" />` : `<div style="font-size:${itemCount > 2 ? "24px" : "36px"}">🎁</div>`;
                  }).join("")}
                </div>
              </div>
            </div>
            <div id="tier-label" style="font-family:'Orbitron',monospace;font-size:18px;letter-spacing:0.25em;color:#3a6672;margin-bottom:4px;transition:all 0.5s ease">OPENING MYSTERY BOX...</div>
            <div id="items-info" style="font-size:12px;color:#3a6672;font-family:'Orbitron',monospace;letter-spacing:0.1em;margin-bottom:5px;opacity:0;transition:opacity 0.8s ease">${items.map(i => i.name).join(" • ")}</div>
            <div id="total-value" style="font-size:12px;color:#3a6672;letter-spacing:0.12em;opacity:0;transition:opacity 0.8s ease">TOTAL VALUE: ${totalValue.toLocaleString()} CR</div>
            <div id="special-message" style="margin-top:10px;font-size:11px;color:#3a6672;letter-spacing:0.1em;opacity:0;transition:opacity 0.8s ease"></div>
            <div id="inventory-note" style="margin-top:12px;font-size:8px;color:#3a6672;letter-spacing:0.25em;opacity:0;transition:opacity 0.8s ease">${itemCount} ITEMS ADDED TO INVENTORY</div>
          </div>`,
        buttons: { ok: { label: "COLLECT", callback: resolve } },
        default: "ok",
        render: htmlEl => {
          const el          = htmlEl instanceof HTMLElement ? htmlEl : htmlEl[0];
          const box         = el.querySelector("#mystery-box");
          const particles   = el.querySelector("#particles");
          const revealCont  = el.querySelector("#reveal-content");
          const tierLabel   = el.querySelector("#tier-label");
          const itemsInfo   = el.querySelector("#items-info");
          const totalVal    = el.querySelector("#total-value");
          const specMsg     = el.querySelector("#special-message");
          const invNote     = el.querySelector("#inventory-note");
          setTimeout(() => { box.style.animation = "shake 0.5s ease-in-out"; }, 500);
          setTimeout(() => {
            box.textContent = "📭"; box.style.transform = "translate(-50%,-50%) scale(1.2)";
            for (let i = 0; i < 12; i++) {
              const p = document.createElement("div");
              p.textContent = ["✨","⭐","💫","🌟"][Math.floor(Math.random() * 4)];
              p.style.cssText = `position:absolute;font-size:20px;left:50%;top:50%;transform:translate(-50%,-50%);animation:pex-${i} 1.2s ease-out forwards`;
              p.style.setProperty("--tx", `${(Math.random() - 0.5) * 200}px`);
              p.style.setProperty("--ty", `${(Math.random() - 0.5) * 200}px`);
              particles.appendChild(p);
            }
          }, 1200);
          setTimeout(() => {
            box.style.opacity = "0"; revealCont.style.opacity = "1";
            tierLabel.textContent = label; tierLabel.style.color = color; tierLabel.style.textShadow = `0 0 14px ${color}`;
          }, 2000);
          setTimeout(() => {
            itemsInfo.style.opacity = "1"; itemsInfo.style.color = color;
            totalVal.style.opacity  = "1"; totalVal.style.color  = "#ffd000";
            if (tier >= 5) { specMsg.textContent = itemCount > 1 ? "🎉 EXTRAORDINARY HAUL! 🎉" : "🎉 EXTRAORDINARY FIND! 🎉"; specMsg.style.color = color; specMsg.style.opacity = "1"; }
            else if (tier >= 3) { specMsg.textContent = itemCount > 1 ? "✦ Lucky Haul! ✦" : "✦ Lucky! ✦"; specMsg.style.color = color; specMsg.style.opacity = "1"; }
            invNote.style.opacity = "1";
          }, 2800);
          const style = document.createElement("style");
          style.textContent = `@keyframes shake{0%,100%{transform:translate(-50%,-50%) rotate(0)}25%{transform:translate(-48%,-50%) rotate(-2deg)}75%{transform:translate(-52%,-50%) rotate(2deg)}}${Array.from({length:12},(_,i)=>`@keyframes pex-${i}{0%{transform:translate(-50%,-50%) scale(0);opacity:1}100%{transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) scale(1.5);opacity:0}}`).join("")}`;
          document.head.appendChild(style);
        },
      });
      d.render(true);
    });
  }

  // ── Overlay / flash ────────────────────────────────────────
  _showOverlay(root, text = "PROCESSING") {
    const overlay = root.querySelector("#vendit-overlay");
    const textEl  = root.querySelector("#vendit-overlay-text");
    if (textEl) textEl.textContent = text;
    overlay?.classList.add("v-active");
  }
  _hideOverlay(root) { root.querySelector("#vendit-overlay")?.classList.remove("v-active"); }
  _flashRoot(root, type) {
    const el = root.querySelector?.(".vendit-root") ?? root;
    el.classList.remove("flash-ok", "flash-err");
    void el.offsetWidth;
    el.classList.add(type === "ok" ? "flash-ok" : "flash-err");
    setTimeout(() => el.classList.remove("flash-ok", "flash-err"), 1000);
  }

  // ── Status bar ─────────────────────────────────────────────
  _updateStatusBar(root) {
    const dot  = root.querySelector("#vd-dot");
    const text = root.querySelector("#vd-status-text");
    const on   = !!socket;
    if (dot)  dot.className    = "vendit-dot" + (on ? "" : " offline");
    if (text) text.textContent = on ? "VENDIT CORP AUTOMATED RETAIL v4.2.1 — ONLINE" : "VENDIT CORP — OFFLINE (socketlib unavailable)";
  }

  // ── Restore state after re-render ─────────────────────────
  _restoreState(root) {
    if (this._selectedBuyerId) { const sel = root.querySelector("#vd-buyer"); if (sel) sel.value = this._selectedBuyerId; }
    if (this._selectedItemId) {
      const row = root.querySelector(`.vendit-item-row[data-item-id="${this._selectedItemId}"]`);
      if (row) { row.classList.add("v-selected"); this._renderDetailPanel(this._selectedItemId, root); }
      else this._selectedItemId = null;
    }
    this._updateSurgeUI(root);
    this._updateCouponUI(root);
    this._applyPricesToList(root);
    this._updateBalance(root);
    this._refreshDispenseBtn(root);
  }
}
