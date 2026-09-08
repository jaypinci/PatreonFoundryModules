/**
 * CWNCharacterSheet — cwn-character-sheet.mjs
 *
 * Standalone ApplicationV2 sheet for CWN (Cities Without Number) characters.
 * Built on HandlebarsApplicationMixin + ActorSheetV2 — no dependency on
 * the swnr system's own sheet classes.
 */

import { CWNFrisk } from '../cwn-frisk.mjs';
import { CWNCyberdeck } from '../cwn-cyberdeck.mjs';
import { prepareEffectsForRender } from '../helpers/effects.mjs';

const { api, sheets } = foundry.applications;

const MODULE_ID = 'New-CWN-Sheets';

// ─── Body-location metadata ───────────────────────────────────────────────────
const CYBER_LOCATIONS = {
  Head:    { label: 'Head & Sensory',    icon: 'fa-brain' },
  Sensory: { label: 'Sensory',           icon: 'fa-eye' },
  Body:    { label: 'Body & Torso',      icon: 'fa-heart' },
  Skin:    { label: 'Skin & Covering',   icon: 'fa-hand' },
  Limb:    { label: 'Limbs',             icon: 'fa-hand-fist' },
  Nerve:   { label: 'Nerves & Neural',   icon: 'fa-bolt' },
  Medical: { label: 'Medical & Biotech', icon: 'fa-syringe' },
  None:    { label: 'Uncategorized',     icon: 'fa-question' },
};

export class CWNCharacterSheet extends api.HandlebarsApplicationMixin(
  sheets.ActorSheetV2
) {
  // ── Per-instance UI state (not persisted to DB) ────────────────────────────
  #dragDrop;
  #searchText = '';
  #collapsedSections = new Set();
  #cyberdeckMode = false;

  constructor(options = {}) {
    super(options);
    this.#dragDrop = this._createDragDropHandlers();
  }

  // ── Static options ──────────────────────────────────────────────────────────

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['cwn-sheet', 'actor', 'character'],
    position: {
      width: 820,
      height: 860,
    },
    window: {
      resizable: true,
    },
    form: {
      submitOnChange: true,
    },
    dragDrop: [{ dragSelector: '[data-drag]', dropSelector: null }],
    actions: {
      onEditImage:           CWNCharacterSheet._onEditImage,
      viewDoc:               CWNCharacterSheet._viewDoc,
      createDoc:             CWNCharacterSheet._createDoc,
      deleteDoc:             CWNCharacterSheet._deleteDoc,
      toggleEffect:          CWNCharacterSheet._toggleEffect,
      roll:                  CWNCharacterSheet._onRoll,
      rollSave:              CWNCharacterSheet._onRollSave,
      rollSkill:             CWNCharacterSheet._onSkillRoll,
      rollUnskilled:         CWNCharacterSheet._onRollUnskilled,
      rollStats:             CWNCharacterSheet._onRollStats,
      reload:                CWNCharacterSheet._onReload,
      rest:                  CWNCharacterSheet._onRest,
      scene:                 CWNCharacterSheet._onScene,
      hitDice:               CWNCharacterSheet._onHitDice,
      skillUp:               CWNCharacterSheet._onSkillUp,
      skillDown:             CWNCharacterSheet._onSkillDown,
      addDefaultSkills:       CWNCharacterSheet._onAddDefaultSkills,
      toggleLock:            CWNCharacterSheet._onToggleLock,
      toggleSection:         CWNCharacterSheet._onToggleSection,
      toggleItemDescription: CWNCharacterSheet._onToggleItemDescription,
      toggleArmor:           CWNCharacterSheet._onToggleArmor,
      toggleProperty:        CWNCharacterSheet._onToggleProperty,
      toggleFavorite:        CWNCharacterSheet._onToggleFavorite,
      rollLuck:               CWNCharacterSheet._onRollLuck,
      // Effects (use effect-id, not item-id)
      createEffect:          CWNCharacterSheet._createEffect,
      viewEffect:            CWNCharacterSheet._viewEffect,
      deleteEffect:          CWNCharacterSheet._deleteEffect,
      creditChange:          CWNCharacterSheet._onCreditChange,
      addUse:                CWNCharacterSheet._onAddUse,
      removeUse:             CWNCharacterSheet._onRemoveUse,
      releaseCommitment:     CWNCharacterSheet._onReleaseCommitment,
      resetPowerUses:        CWNCharacterSheet._onResetPowerUses,
      postToChat:            CWNCharacterSheet._onPostToChat,
      frisk:                 CWNCharacterSheet._onFrisk,
      toggleCyberdeck:       CWNCharacterSheet._onToggleCyberdeck,
      cyberdeckPipClick:     CWNCharacterSheet._onCyberdeckPipClick,
      cyberdeckResetAccess:  CWNCharacterSheet._onCyberdeckResetAccess,
      cyberdeckSpendAccess:  CWNCharacterSheet._onCyberdeckSpendAccess,
      cyberdeckAddProgram:   CWNCharacterSheet._onCyberdeckAddProgram,
      cyberdeckRemoveLastProgram: CWNCharacterSheet._onCyberdeckRemoveLastProgram,
      cyberdeckChangeVerb:   CWNCharacterSheet._onCyberdeckChangeVerb,
      cyberdeckChangeSubject: CWNCharacterSheet._onCyberdeckChangeSubject,
      cyberdeckRollProgram:  CWNCharacterSheet._onCyberdeckRollProgram,
      cyberdeckRunProgram:   CWNCharacterSheet._onCyberdeckRunProgram,
      cyberdeckSave:         CWNCharacterSheet._onCyberdeckSave,
      cyberdeckLoad:         CWNCharacterSheet._onCyberdeckLoad,
      cyberdeckChangeDeck:   CWNCharacterSheet._onCyberdeckChangeDeck,
    },
  };

  // ── PARTS ───────────────────────────────────────────────────────────────────

  /** @override */
  static PARTS = {
    header: {
      template: 'modules/New-CWN-Sheets/templates/actor/parts/header.hbs',
    },
    tabs: {
      template: 'templates/generic/tab-navigation.hbs',
    },
    combat: {
      template: 'modules/New-CWN-Sheets/templates/actor/parts/combat.hbs',
    },
    skills: {
      template: 'modules/New-CWN-Sheets/templates/actor/parts/skills.hbs',
    },
    gear: {
      template: 'modules/New-CWN-Sheets/templates/actor/parts/gear.hbs',
    },
    cyberware: {
      template: 'modules/New-CWN-Sheets/templates/actor/parts/cyberware.hbs',
    },
    powers: {
      template: 'modules/New-CWN-Sheets/templates/actor/parts/powers.hbs',
    },
    biography: {
      template: 'modules/New-CWN-Sheets/templates/actor/parts/biography.hbs',
    },
    effects: {
      template: 'modules/New-CWN-Sheets/templates/actor/parts/effects.hbs',
    },
    features: {
      template: 'modules/New-CWN-Sheets/templates/actor/parts/features.hbs',
    },
    main: {
      template: 'modules/New-CWN-Sheets/templates/actor/parts/main.hbs',
    },
    cyberdeck: {
      template: 'modules/New-CWN-Sheets/templates/actor/parts/cyberdeck.hbs',
    },
  };

  // ── Render options ──────────────────────────────────────────────────────────

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);

    const cyberdeckMode = this.#cyberdeckMode;
    if (cyberdeckMode) {
      options.parts = ['header', 'cyberdeck'];
      return;
    }

    options.parts = ['header', 'tabs', 'main', 'gear', 'skills', 'features', 'biography', 'effects'];

    if (!this.document.limited) {
      const tweak = this.document.system.tweak ?? {};

      if (tweak.showCyberware) {
        options.parts.splice(options.parts.indexOf('biography'), 0, 'cyberware');
      }
    }
  }

  // ── Context ─────────────────────────────────────────────────────────────────

  /** @override */
  async _prepareContext(options) {
    const actor  = this.actor;
    const system = actor.system;

    // Get soak from flags, initialize if not present
    let soak = actor.getFlag('New-CWN-Sheets', 'soak');
    if (!soak) {
      soak = { value: 0, max: 0 };
      await actor.setFlag('New-CWN-Sheets', 'soak', soak);
    }
    system.soak = soak;

    // ── FIX: schema.fields lives on the Actor class, not this.document directly ──
    // actor.schema is the DocumentSchema for the Actor document.
    // actor.system.schema is the DataSchema for the system data model.
    const fields       = actor.schema?.fields       ?? {};
    const systemFields = actor.system.schema?.fields ?? {};

    const context = {
      editable:          this.isEditable,
      owner:             actor.isOwner,
      limited:           actor.limited,
      actor,
      system,
      flags:             { ...actor.flags, 'New-CWN-Sheets': { ...actor.flags?.['New-CWN-Sheets'], cyberdeckModeActive: this.#cyberdeckMode } },
      config:            CONFIG.SWN,
      tabs:              this._getTabs(options.parts),
      fields,
      systemFields,
      searchText:        this.#searchText,
      collapsedSections: this.#collapsedSections,
      moduleId:          'New-CWN-Sheets',
    };

    await this._prepareItems(context);
    this._preparePools(context);
    this._prepareEffects(context);
    await this._prepareCyberdeckContext(context);

    // Ensure soak data structure exists in context
    if (!context.system.soak) {
      context.system.soak = { value: 0, max: 0 };
    }

    // Calculate effective AC from equipped (use=true) readied armor
    let baseAc = 10;
    let bonusAc = 0;
    let baseMeleeAc = 10;
    let bonusMeleeAc = 0;
    let hasMeleeOverride = false;

    const equippedArmor = context.readiedArmor?.filter(a => a.system?.use) ?? [];
    
    equippedArmor.forEach(a => {
      const acRaw = a.system?.acDisplay ?? a.system?.ac;
      const mAcRaw = a.system?.meleeAcDisplay ?? a.system?.meleeAc;
      
      // System-native shield bonuses
      const shieldBonus = a.system?.shieldACBonus ?? 0;
      const shieldMeleeBonus = a.system?.shieldMeleeACBonus ?? 0;
      
      bonusAc += shieldBonus;

      // Handle standard AC
      if (typeof acRaw === "string" && acRaw.trim().startsWith("+")) {
        bonusAc += parseInt(acRaw.replace("+", "")) || 0;
      } else {
        const val = parseInt(acRaw) || 0;
        if (val > 0) {
          if (val > baseAc) baseAc = val;
        }
      }

      // Handle Melee AC
      if (shieldMeleeBonus > 0) hasMeleeOverride = true;
      bonusMeleeAc += shieldMeleeBonus;

      if (mAcRaw !== undefined && mAcRaw !== null && mAcRaw !== "") {
        hasMeleeOverride = true;
        if (typeof mAcRaw === "string" && mAcRaw.trim().startsWith("+")) {
          bonusMeleeAc += parseInt(mAcRaw.replace("+", "")) || 0;
        } else {
          const val = parseInt(mAcRaw) || 0;
          if (val > 0) {
            if (val > baseMeleeAc) baseMeleeAc = val;
          }
        }
      }
    });

    let effectiveAc = baseAc + bonusAc;
    let effectiveMeleeAc = hasMeleeOverride ? (baseMeleeAc + bonusMeleeAc) : null;

    // Add dex modifier to both AC and melee AC after armor calculation
    const dexMod = context.system.stats?.dex?.mod ?? 0;
    effectiveAc += dexMod;
    if (effectiveMeleeAc !== null) {
      effectiveMeleeAc += dexMod;
    }

    // Override system AC values with calculated effective AC
    context.system = foundry.utils.mergeObject(
      foundry.utils.deepClone(context.system),
      { ac: effectiveAc, meleeAc: effectiveMeleeAc }
    );

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context) {
    switch (partId) {
      case 'main':
      case 'gear':
      case 'skills':
      case 'features':
      case 'cyberware':
      case 'effects':
        context.tab = context.tabs[partId];
        break;

      case 'cyberdeck':
        context.tab = null;
        break;

      case 'biography': {
        context.tab = context.tabs[partId];
        const TextEditorImpl = foundry.applications.ux?.TextEditor?.implementation
          ?? TextEditor;
        context.enrichedBiography = await TextEditorImpl.enrichHTML(
          this.actor.system.biography ?? '',
          {
            secrets:  this.document.isOwner,
            rollData: this.actor.getRollData(),
            relativeTo: this.actor,
          }
        );
        try {
          context.availableLanguages =
            (game.settings.get('swnr', 'parsedLanguageList') || []);
        } catch (e) {
          context.availableLanguages = [];
        }
        break;
      }
    }
    return context;
  }

  // ── Tab helpers ─────────────────────────────────────────────────────────────

  _getTabs(parts) {
    const tabGroup = 'primary';

    // Ensure the tab group has a default; only set if not already set
    if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = 'main';

    const TAB_DEFS = {
      main:      { id: 'main',      label: 'Main',      icon: 'fa-id-card' },
      gear:      { id: 'gear',      label: 'Gear',      icon: 'fa-bag-shopping' },
      cyberware: { id: 'cyberware', label: 'Cyberware', icon: 'fa-microchip' },
      skills:    { id: 'skills',    label: 'Skills',    icon: 'fa-graduation-cap' },
      features:  { id: 'features',  label: 'Features',  icon: 'fa-star' },
      biography: { id: 'biography', label: 'Biography', icon: 'fa-book-open' },
      effects:   { id: 'effects',   label: 'Effects',   icon: 'fa-star-half-stroke' },
    };

    return parts.reduce((tabs, partId) => {
      const def = TAB_DEFS[partId];
      if (!def) return tabs;
      tabs[partId] = {
        cssClass: this.tabGroups[tabGroup] === def.id ? 'active' : '',
        group:    tabGroup,
        id:       def.id,
        icon:     def.icon,
        label:    def.label,
      };
      return tabs;
    }, {});
  }

  // ── Item preparation ────────────────────────────────────────────────────────

  async _prepareItems(context) {
    const actor      = this.actor;
    const MODULE_ID  = 'New-CWN-Sheets';
    const favorites  = new Set(actor.getFlag(MODULE_ID, 'favorites') ?? []);
    const TextEditorImpl = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;

    const weapons     = [];
    const armor       = [];
    const gear        = [];
    const consumables = [];
    const skills      = [];
    const features    = [];
    const powersByType = {};
    const cyberByLocation = {};

    for (const loc of Object.keys(CYBER_LOCATIONS)) cyberByLocation[loc] = [];

    for (const item of actor.items) {
      item.isFavorite = favorites.has(item.id);

      // Enrich description for items that have it
      if (item.system?.description && !item.system.enrichedDescription) {
        item.system.enrichedDescription = await TextEditorImpl.enrichHTML(
          item.system.description,
          {
            secrets: this.document.isOwner,
            rollData: this.actor.getRollData(),
            relativeTo: this.actor,
          }
        );
      }

      switch (item.type) {
        case 'weapon':    weapons.push(item);  break;
        case 'armor': {
          const acFlag = item.getFlag(MODULE_ID, 'acDisplay');
          item.system.acDisplay = acFlag !== undefined ? acFlag : item.system.ac;
          armor.push(item);
          break;
        }
        case 'skill':     skills.push(item);   break;
        case 'feature':   features.push(item); break;

        case 'item': {
          const consumable = item.system?.uses?.consumable ?? 'none';
          if (consumable === 'none') gear.push(item);
          else consumables.push(item);
          break;
        }

        case 'cyberware': {
          const locKey = CYBER_LOCATIONS[item.system?.type] ? item.system.type : 'None';
          cyberByLocation[locKey].push(item);
          break;
        }

        case 'power': {
          const subType = item.system?.subType || 'psychic';
          const level   = item.system?.level ?? 0;
          if (!powersByType[subType]) powersByType[subType] = {};
          if (!powersByType[subType][level]) powersByType[subType][level] = [];
          powersByType[subType][level].push(item);
          break;
        }
      }
    }

    const bySort = (a, b) => (a.sort || 0) - (b.sort || 0);
    weapons.sort(bySort);
    armor.sort(bySort);
    gear.sort(bySort);
    consumables.sort(bySort);
    skills.sort((a, b) => a.name.localeCompare(b.name));
    features.sort(bySort);

    const cyberGroups = Object.entries(CYBER_LOCATIONS)
      .map(([key, meta]) => ({
        key,
        label: meta.label,
        icon:  meta.icon,
        items: cyberByLocation[key].sort(bySort),
      }))
      .filter(g => g.items.length > 0);

    const readiedWeapons = weapons.filter(i => i.system?.location === 'readied');
    const readiedArmor   = armor.filter(i   => i.system?.location === 'readied');
    const favoriteItems  = actor.items.filter(i => favorites.has(i.id));

    Object.assign(context, {
      weapons,
      armor,
      gear,
      consumables,
      skills,
      features,
      cyberGroups,
      cyberLocations: CYBER_LOCATIONS,
      powersByType,
      readiedWeapons,
      readiedArmor,
      favorites:  favoriteItems,
      hasFavorites: favoriteItems.length > 0,
    });
  }

  // ── Effects preparation ─────────────────────────────────────────────────────

  _prepareEffects(context) {
    context.effects = prepareEffectsForRender(this.actor);
  }

  /** @override */
  _replaceHTML(result, content, options) {
    super._replaceHTML(result, content, options);
    const activeParts = new Set(options.parts ?? Object.keys(this.constructor.PARTS));
    for (const partId of Object.keys(this.constructor.PARTS)) {
      if (activeParts.has(partId)) continue;
      this.element.querySelector(`[data-application-part="${partId}"]`)?.remove();
    }
  }

  // ── Pool preparation ────────────────────────────────────────────────────────

  _preparePools(context) {
    const pools      = this.actor.system.pools || {};
    const poolGroups = {};

    for (const [poolKey, poolData] of Object.entries(pools)) {
      const [resourceName, subResource] = poolKey.split(':');
      if (!poolGroups[resourceName]) {
        poolGroups[resourceName] = { resourceName, pools: [] };
      }
      const n = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
      const value     = n(poolData.value);
      const max       = n(poolData.max);
      const committed = n(poolData.committed);

      poolGroups[resourceName].pools.push({
        key:            poolKey,
        subResource:    subResource || 'Default',
        current:        value,
        max,
        cadence:        poolData.cadence,
        committed,
        commitments:    poolData.commitments || [],
        percentage:     max > 0 ? Math.round((value / max) * 100) : 0,
        isEmpty:        value === 0,
        isFull:         value >= max,
        isLow:          max > 0 && value / max < 0.25,
        hasCommitments: committed > 0,
      });
    }

    const poolGroupsArray = Object.values(poolGroups)
      .sort((a, b) => a.resourceName.localeCompare(b.resourceName));

    context.poolGroups  = poolGroupsArray;
    context.hasAnyPools = poolGroupsArray.length > 0;
  }

  // ── Render / Listeners ──────────────────────────────────────────────────────

  /** @override */
  _onRender(context, options) {
    this.#dragDrop.forEach(d => d.bind(this.element));
    this.element.classList.toggle('cwn-cyberdeck-mode', this.#cyberdeckMode);

    // ── Restore lock state from flag ───────────────────────────────────────
    const locked = this.actor.getFlag('New-CWN-Sheets', 'sheetLocked');
    if (locked) {
      this.element.classList.add('cwn-locked');
      this.element.querySelectorAll('.lock-indicator').forEach(el => {
        el.classList.add('locked');
      });
    }

    // ── FIX: Ensure initial tab content is visible ───────────────────────────
    // ApplicationV2 sheets sometimes don't show the initial tab content properly
    const tabGroup = 'primary';
    const activeTab = this.tabGroups[tabGroup] || 'combat';

    // Activate the tab navigation
    const navTabs = this.element.querySelectorAll('nav.tabs [data-tab]');
    navTabs.forEach(tab => {
      const isActive = tab.dataset.tab === activeTab;
      tab.classList.toggle('active', isActive);
    });

    // Show the active tab content
    const tabContents = this.element.querySelectorAll('.cwn-tab[data-tab]');
    tabContents.forEach(content => {
      const isActive = content.dataset.tab === activeTab;
      content.classList.toggle('active', isActive);
      // Force display style for the active tab
      if (isActive) content.style.display = '';
    });

    // Location selector changes
    this.element.querySelectorAll('.location-selector').forEach(el =>
      el.addEventListener('change', this._onLocationChange.bind(this))
    );

    // Inline skill editing (name and source inputs)
    // Stop propagation so Foundry's submitOnChange form handler doesn't intercept
    this.element.querySelectorAll('.cwn-skill-name-input, .cwn-skill-source-input').forEach(el => {
      el.addEventListener('change', ev => {
        ev.stopPropagation();
        this._onSkillEdit(ev);
      });
      el.addEventListener('keydown', ev => { if (ev.key === 'Enter') ev.preventDefault(); });
    });

    // Inline armor AC editing
    this.element.querySelectorAll('.cwn-armor-ac-input').forEach(el => {
      el.addEventListener('change', ev => {
        ev.stopPropagation();
        this._onArmorEdit(ev);
      });
      el.addEventListener('keydown', ev => { if (ev.key === 'Enter') ev.preventDefault(); });
    });

    // Soak input handling - manual save since not in SWN schema
    const soakInputs = this.element.querySelectorAll('.cwn-soak-input');
    soakInputs.forEach(el => {
      el.addEventListener('change', ev => {
        ev.stopPropagation();
        this._onSoakChange(ev);
      });
    });

    // Inventory search
    const searchInput = this.element.querySelector('.cwn-search-input');
    if (searchInput) {
      searchInput.value = this.#searchText;
      searchInput.addEventListener('input', ev => {
        this.#searchText = ev.target.value;
        this._applySearch(ev.target.value);
      });
      const clearBtn = this.element.querySelector('.cwn-search-clear');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          searchInput.value = '';
          this.#searchText = '';
          this._applySearch('');
        });
      }
      this._applySearch(this.#searchText);
    }

    this._applyCollapsedStates();

    // ── Cyberdeck panel select wiring ──────────────────────────────────────
    // Selects in the cyberdeck panel must NOT use data-action — that causes
    // Foundry's form submitOnChange to fire and re-render mid-interaction.
    // Wire them here with stopPropagation to keep the dropdown usable.

    this.element.querySelectorAll('.cdp-verb-sel').forEach(sel => {
      sel.addEventListener('change', ev => {
        ev.stopPropagation();
        ev.preventDefault();
        const slot = parseInt(sel.dataset.slot);
        const state = CWNCyberdeck.getState(this.actor);
        if (state.programs[slot]) state.programs[slot].verb = sel.value;
        CWNCyberdeck.saveState(this.actor, state);
        // Update cost badge in same row without full re-render
        const row = sel.closest('.cdp-prog-row');
        const verbData = CWNCyberdeck.VERBS.find(v => v.name === sel.value);
        const costEl = row?.querySelector('.cdp-cost');
        if (costEl && verbData) {
          const free = verbData.cost === 0;
          costEl.textContent = free ? 'FREE' : `${verbData.cost}▲`;
          costEl.classList.toggle('free', free);
        }
      });
    });

    this.element.querySelectorAll('.cdp-subject-sel').forEach(sel => {
      sel.addEventListener('change', ev => {
        ev.stopPropagation();
        ev.preventDefault();
        const slot = parseInt(sel.dataset.slot);
        const state = CWNCyberdeck.getState(this.actor);
        if (state.programs[slot]) state.programs[slot].subject = sel.value;
        CWNCyberdeck.saveState(this.actor, state);
      });
    });

    const deckSel = this.element.querySelector('#cdp-deck-selector');
    if (deckSel) {
      deckSel.addEventListener('change', ev => {
        ev.stopPropagation();
        ev.preventDefault();
        const state = CWNCyberdeck.getState(this.actor);
        state.deckName = deckSel.value;
        const d = CWNCyberdeck.DECKS[deckSel.value];
        if (d) { state.accessMax = d.memory; state.accessCur = Math.min(state.accessCur, d.memory); }
        CWNCyberdeck.saveState(this.actor, state);
        // Re-render the cyberdeck part to reflect new deck stats
        this.render({ parts: ['header', 'cyberdeck'] });
      });
    }
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  _applySearch(query) {
    const q = (query ?? '').toLowerCase().trim();
    this.element.querySelectorAll('[data-searchable-row]').forEach(row => {
      const nameEl = row.querySelector('[data-item-name]');
      const name   = (nameEl?.textContent ?? '').toLowerCase();
      row.style.display = !q || name.includes(q) ? '' : 'none';
    });
  }

  // ── Section collapse ────────────────────────────────────────────────────────

  _applyCollapsedStates() {
    for (const key of this.#collapsedSections) {
      const content = this.element.querySelector(`[data-section-content="${key}"]`);
      const chevron = this.element.querySelector(`[data-section-toggle="${key}"] .section-chevron`);
      if (content) content.classList.add('collapsed');
      if (chevron) chevron.classList.add('rotated');
    }
  }

  // ── Location change ─────────────────────────────────────────────────────────

  async _onLocationChange(event) {
    const value  = event.target.value;
    const itemId = event.target.dataset.itemId;
    await this.actor.items.get(itemId)?.update({ 'system.location': value });
  }

  // ── Armor AC Edit ──────────────────────────────────────────────────────────

  async _onArmorEdit(event) {
    const val = event.target.value.trim();
    const itemId = event.target.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    if (val.startsWith('+')) {
      await item.setFlag(MODULE_ID, 'acDisplay', val);
      // Still update core field so system rolls might use it, but keep flag for display
      await item.update({ 'system.ac': parseInt(val.replace('+', '')) || 0 });
    } else {
      await item.unsetFlag(MODULE_ID, 'acDisplay');
      await item.update({ 'system.ac': parseInt(val) || 0 });
    }
  }

  // ── Drag & Drop ─────────────────────────────────────────────────────────────

  _createDragDropHandlers() {
    return (this.options.dragDrop || []).map(d => {
      d.permissions = {
        dragstart: this._canDragStart.bind(this),
        drop:      this._canDragDrop.bind(this),
      };
      d.callbacks = {
        dragstart: this._onDragStart.bind(this),
        drop:      this._onDrop.bind(this),
      };
      return new foundry.applications.ux.DragDrop.implementation(d);
    });
  }

  _canDragStart() { return this.isEditable; }
  _canDragDrop()  { return this.isEditable; }

  _onDragStart(event) {
    const row = event.currentTarget.closest('[data-item-id]');
    if (!row) return;
    const item = this.actor.items.get(row.dataset.itemId);
    if (!item) return;
    event.dataTransfer.setData('text/plain', JSON.stringify(item.toDragData()));
  }

  async _onDrop(event) {
    const TextEditorImpl = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;
    const data    = TextEditorImpl.getDragEventData(event);
    const allowed = Hooks.call('dropActorSheetData', this.actor, this, data);
    if (allowed === false) return;
    if (data.type === 'Item') return this._onDropItem(event, data);
  }

  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    if (this.actor.uuid === item.parent?.uuid) return;
    return this.actor.createEmbeddedDocuments('Item', [item.toObject()]);
  }

  // ── Helper: get embedded item from a [data-item-id] row ────────────────────

  _getEmbeddedDocument(target) {
    const row = target.closest('[data-item-id]');
    if (!row) return null;
    return this.actor.items.get(row.dataset.itemId) ?? null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  STATIC ACTION HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  static async _onPostToChat(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item) return;

    const content = await renderTemplate('modules/New-CWN-Sheets/templates/chat/item-card.hbs', {
      item: item.toObject(),
      actor: this.actor.toObject(),
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
      style: CONST.CHAT_MESSAGE_STYLES.IC,
    });
  }

  static async _onFrisk(event, target) {
    await CWNFrisk.initiate(this.actor);
  }

  // ── CYBERDECK MODE ───────────────────────────────────────────────────────────

  static async _onToggleCyberdeck(event, target) {
    event.preventDefault();
    this.#cyberdeckMode = !this.#cyberdeckMode;
    await this.render(true);
  }

  static async _onCyberdeckPipClick(event, target) {
    const idx = parseInt(target.dataset.pipIndex);
    const state = CWNCyberdeck.getState(this.actor);
    if (idx < state.accessCur) state.accessCur--;
    else if (idx === state.accessCur) state.accessCur++;
    CWNCyberdeck.saveState(this.actor, state);
    this.render({ parts: ['cyberdeck'] });
  }

  static async _onCyberdeckResetAccess(event, target) {
    const state = CWNCyberdeck.getState(this.actor);
    state.accessCur = state.accessMax;
    CWNCyberdeck.saveState(this.actor, state);
    this.render({ parts: ['cyberdeck'] });
  }

  static async _onCyberdeckSpendAccess(event, target) {
    const amount = parseInt(target.dataset.amount) || 1;
    const state = CWNCyberdeck.getState(this.actor);
    state.accessCur = Math.max(0, state.accessCur - amount);
    CWNCyberdeck.saveState(this.actor, state);
    this.render({ parts: ['cyberdeck'] });
  }

  static async _onCyberdeckAddProgram(event, target) {
    const slot = parseInt(target.dataset.slot);
    const state = CWNCyberdeck.getState(this.actor);
    state.programs[slot] = { verb: 'Analyze', subject: 'Camera', slot };
    CWNCyberdeck.saveState(this.actor, state);
    this.render({ parts: ['cyberdeck'] });
  }

  static async _onCyberdeckRemoveLastProgram(event, target) {
    const state = CWNCyberdeck.getState(this.actor);
    const totalSlots = CWNCyberdeck.totalSlots(state);
    for (let i = totalSlots - 1; i >= 0; i--) {
      if (state.programs[i]) { state.programs[i] = null; break; }
    }
    state.programs = state.programs.filter(Boolean);
    CWNCyberdeck.saveState(this.actor, state);
    this.render({ parts: ['cyberdeck'] });
  }

  static async _onCyberdeckChangeVerb(event, target) {
    // No-op: handled by _onRender listener to avoid submitOnChange interference
  }

  static async _onCyberdeckChangeSubject(event, target) {
    // No-op: handled by _onRender listener to avoid submitOnChange interference
  }

  static async _onCyberdeckRollProgram(event, target) {
    const slot = parseInt(target.dataset.slot);
    const state = CWNCyberdeck.getState(this.actor);
    const prog = state.programs[slot];
    if (!prog) return;
    await CWNCyberdeck.rollProgramCheck(this.actor, prog);
  }

  static async _onCyberdeckRunProgram(event, target) {
    const slot = parseInt(target.dataset.slot);
    const state = CWNCyberdeck.getState(this.actor);
    const prog = state.programs[slot];
    if (!prog) return;
    await CWNCyberdeck.runProgram(this.actor, prog, state);
    CWNCyberdeck.saveState(this.actor, state);
    this.render({ parts: ['cyberdeck'] });
  }

  static async _onCyberdeckSave(event, target) {
    const state = CWNCyberdeck.getState(this.actor);
    await CWNCyberdeck.saveToActor(this.actor, state);
    ui.notifications?.info(`Cyberdeck setup saved to ${this.actor.name}.`);
  }

  static async _onCyberdeckLoad(event, target) {
    const setup = await CWNCyberdeck.loadFromActor(this.actor);
    if (!setup) { ui.notifications?.warn('No cyberdeck setup saved on this character.'); return; }
    const state = CWNCyberdeck.getState(this.actor);
    Object.assign(state, setup);
    state.accessMax = CWNCyberdeck.DECKS[state.deckName]?.memory ?? 8;
    state.accessCur = state.accessMax;
    CWNCyberdeck.saveState(this.actor, state);
    this.render({ parts: ['cyberdeck'] });
    ui.notifications?.info('Cyberdeck setup loaded.');
  }

  static async _onCyberdeckChangeDeck(event, target) {
    // No-op: handled by _onRender listener to avoid submitOnChange interference
  }

  async _prepareCyberdeckContext(context) {
    const state   = CWNCyberdeck.getState(this.actor);
    const deck    = CWNCyberdeck.DECKS[state.deckName] ?? CWNCyberdeck.DECKS['Scrap Deck'];
    const actor   = this.actor;
    const sys     = actor.system;

    // INT stat
    const intVal = sys?.stats?.int?.value ?? sys?.attributes?.int?.value ?? 10;
    const intMod = sys?.stats?.int?.mod   ?? Math.floor((intVal - 10) / 2);
    const intModStr = (intMod >= 0 ? '+' : '') + intMod;

    // Program skill from items
    let programSkill = state.programSkill ?? 0;
    const progItem = actor.items?.find(i =>
      i.type === 'skill' && (i.name?.toLowerCase().includes('program') || i.name?.toLowerCase().includes('hack'))
    );
    if (progItem) programSkill = progItem.system?.rank ?? progItem.system?.level ?? 0;

    // CPU / slots
    let effectiveCpu = deck.cpu;
    if (state.expertProgrammer && (state.expertLevel ?? 1) >= 2) effectiveCpu += programSkill;
    const extraSlots = state.expertProgrammer ? (state.charLevel ?? 1) + 2 : 0;
    const totalSlots = effectiveCpu + extraSlots;
    const halfMemory = state.expertProgrammer && (state.expertLevel ?? 1) >= 2;
    const memPerSlot = halfMemory ? 0.5 : 1;

    // Build pip array
    const accessMax = Math.min(state.accessMax, 20);
    const accessPips = Array.from({ length: accessMax }, (_, i) => ({
      index: i,
      filled: i < state.accessCur,
    }));

    // Build program slot array
    const programs = state.programs ?? [];
    const programSlots = Array.from({ length: totalSlots }, (_, i) => {
      const prog = programs[i];
      const verbData = prog ? CWNCyberdeck.VERBS.find(v => v.name === prog.verb) : null;
      return {
        index: i,
        slotNum: i + 1,
        isEmpty: !prog,
        isExtra: i >= effectiveCpu,
        verb: prog?.verb ?? '',
        subject: prog?.subject ?? '',
        cost: verbData?.cost ?? 0,
        isFree: (verbData?.cost ?? 0) === 0,
      };
    });

    // Memory used
    const memUsed = programs.filter(Boolean).length * memPerSlot;
    const memOverflow = memUsed > deck.memory;

    // Matrix scene flags (read-only display)
    const matrixData = canvas?.scene?.getFlag('macros-without-number', 'matrix') ?? {};

    context.cdp = {
      // Deck
      deckName:       state.deckName,
      deckNames:      Object.keys(CWNCyberdeck.DECKS),
      deckDesc:       deck.desc,
      deckMemory:     deck.memory,
      deckShielding:  deck.shielding,
      deckBonusAccess: deck.bonusAccess,
      effectiveCpu,

      // Actor stats
      intVal, intMod, intModStr,
      programSkill,

      // Avatar
      handle: state.avatarHandle ?? '',
      avatarUrl: state.avatarUrl ?? '',

      // Access tracker
      accessCur:  state.accessCur,
      accessMax,
      accessPips,

      // Programs
      programSlots,
      hasPrograms: programs.filter(Boolean).length > 0,
      memUsed,
      memOverflow,
      halfMemory,
      verbNames:    CWNCyberdeck.VERBS.map(v => v.name),
      subjectNames: CWNCyberdeck.SUBJECTS.map(s => s.name),

      // Quick ref
      verbs:        CWNCyberdeck.VERBS.map(v => ({ ...v, isFree: v.cost === 0 })),
      subjects:     CWNCyberdeck.SUBJECTS,
      verbsJson:    JSON.stringify(CWNCyberdeck.VERBS),
      subjectsJson: JSON.stringify(CWNCyberdeck.SUBJECTS),

      // Matrix status
      matrixActive:  !!matrixData.active,
      matrixAlerted: !!matrixData.alerted,
    };
  }

  static async _onEditImage(event, target) {
    const attr    = target.dataset.edit;
    const current = foundry.utils.getProperty(this.document, attr);
    const fp = new FilePicker({
      current,
      type:     'image',
      callback: path => this.document.update({ [attr]: path }),
      top:      this.position.top  + 40,
      left:     this.position.left + 10,
    });
    return fp.browse();
  }

  // ── View / Create / Delete ──────────────────────────────────────────────────

  static async _viewDoc(event, target) {
    const doc = this._getEmbeddedDocument(target);
    doc?.sheet.render(true);
  }

  static async _createDoc(event, target) {
    const type   = target.dataset.type;
    const docCls = getDocumentClass(target.dataset.documentClass ?? 'Item');
    const name   = type
      ? (docCls.defaultName?.({ type, parent: this.actor }) ?? `New ${type}`)
      : 'New Item';
    const docData = { name, type };
    await docCls.create(docData, { parent: this.actor });
  }

  static async _deleteDoc(event, target) {
    const doc = this._getEmbeddedDocument(target);
    if (!doc) return;

    if (event.shiftKey) { await doc.delete(); return; }

    await foundry.applications.api.DialogV2.confirm({
      window:  { title: `Delete ${doc.name}?` },
      content: `<p>Delete <strong>${doc.name}</strong> from ${this.actor.name}?</p>`,
      yes:     { callback: () => doc.delete() },
    });
  }

  // ── Effects ─────────────────────────────────────────────────────────────────

  static async _toggleEffect(event, target) {
    const row    = target.closest('[data-effect-id]');
    if (!row) return;
    const effect = this.actor.effects.get(row.dataset.effectId);
    if (effect) await effect.update({ disabled: !effect.disabled });
  }

  // ── Effect CRUD ────────────────────────────────────────────────────────────

  static async _createEffect(event, target) {
    const effectData = {
      name:   ActiveEffect.defaultName({ parent: this.actor }),
      icon:   'icons/svg/aura.svg',
    };
    await ActiveEffect.create(effectData, { parent: this.actor });
  }

  static async _viewEffect(event, target) {
    const row    = target.closest('[data-effect-id]');
    const effect = this.actor.effects.get(row?.dataset.effectId);
    effect?.sheet.render(true);
  }

  static async _deleteEffect(event, target) {
    const row    = target.closest('[data-effect-id]');
    const effect = this.actor.effects.get(row?.dataset.effectId);
    if (!effect) return;
    if (event.shiftKey) { await effect.delete(); return; }
    await foundry.applications.api.DialogV2.confirm({
      window:  { title: `Delete ${effect.name}?` },
      content: `<p>Delete effect <strong>${effect.name}</strong>?</p>`,
      yes:     { callback: () => effect.delete() },
    });
  }

  // ── Default CWN Skills ───────────────────────────────────────────────────────────

  static DEFAULT_CWN_SKILLS = [
    { name: 'Administer', description: 'Manage an organization, handle paperwork, analyze records, and keep an institution functioning on a daily basis.' },
    { name: 'Connect', description: 'Find people who can be helpful to your purposes and get them to cooperate with you.' },
    { name: 'Drive', description: 'Drive vehicles, tend to basic vehicle repair, and handle land transportation.' },
    { name: 'Exert', description: 'Apply trained speed, strength, or stamina in some feat of physical exertion.' },
    { name: 'Fix', description: 'Create and repair devices both simple and complex.' },
    { name: 'Heal', description: 'Employ medical and psychological treatment for the injured or disturbed.' },
    { name: 'Know', description: 'Know facts about academic or scientific fields.' },
    { name: 'Lead', description: 'Convince others to also do whatever it is you\'re trying to do.' },
    { name: 'Notice', description: 'Spot anomalies or interesting facts about your environment.' },
    { name: 'Perform', description: 'Exhibit some performative skill.' },
    { name: 'Pilot', description: 'Pilot vehicles, fly spaceships, or tend to basic vehicle repair.' },
    { name: 'Program', description: 'Operating or hacking computing and communications hardware.' },
    { name: 'Punch', description: 'Use as a combat skill when fighting unarmed.' },
    { name: 'Shoot', description: 'Use as a combat skill when using ranged weaponry.' },
    { name: 'Sneak', description: 'Move without drawing notice.' },
    { name: 'Stab', description: 'Use as a combat skill when wielding melee weapons.' },
    { name: 'Survive', description: 'Obtain the basics of food, water, and shelter in hostile environments.' },
    { name: 'Talk', description: 'Convince other people of the facts you want them to believe.' },
    { name: 'Trade', description: 'Find what you need on the market and sell what you have.' },
    { name: 'Work', description: 'Catch-all skill for professions not represented by other skills.' },
  ];

  static async _onAddDefaultSkills(event, target) {
    const actor = this.actor;
    const existingSkills = new Set(actor.items.filter(i => i.type === 'skill').map(i => i.name));

    const skillsToAdd = CWNCharacterSheet.DEFAULT_CWN_SKILLS.filter(s => !existingSkills.has(s.name));

    if (skillsToAdd.length === 0) {
      ui.notifications.info('All default skills already exist.');
      return;
    }

    const createData = skillsToAdd.map(skill => ({
      type: 'skill',
      name: skill.name,
      system: {
        rank: -1,
        pool: 'ask',
        description: skill.description,
        source: 'CWN',
        stats: 'dex',
      },
    }));

    await actor.createEmbeddedDocuments('Item', createData);
    ui.notifications.info(`Added ${skillsToAdd.length} default skills.`);
  }

  // ── Skill up ────────────────────────────────────────────────────────────────

  static async _onSkillUp(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item) return;
    await item.update({ 'system.rank': (item.system.rank ?? 0) + 1 });
  }

  static async _onSkillDown(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item) return;
    await item.update({ 'system.rank': Math.max(-1, (item.system.rank ?? 0) - 1) });
  }

  // ── Inline skill editing ────────────────────────────────────────────────────

  async _onSkillEdit(event) {
    const input = event.target;
    const itemId = input.dataset.itemId;
    const field = input.dataset.field;
    const value = input.value.trim();
    if (!itemId || !field) return;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    await item.update({ [field]: value });
  }

  // ── Soak editing ─────────────────────────────────────────────────────────────

  async _onSoakChange(event) {
    const input = event.target;
    const field = input.dataset.soakField;
    const value = parseInt(input.value) || 0;
    const currentSoak = this.actor.getFlag('New-CWN-Sheets', 'soak') || { value: 0, max: 0 };
    currentSoak[field] = value;
    await this.actor.setFlag('New-CWN-Sheets', 'soak', currentSoak);
  }

  // ── Toggle boolean property on an item ──────────────────────────────────────

  static async _onToggleProperty(event, target) {
    const item     = this._getEmbeddedDocument(target);
    const property = target.dataset.property;
    if (!item || !property) return;
    const current = foundry.utils.getProperty(item.system, property);
    if (typeof current !== 'boolean') return;
    await item.update({ [`system.${property}`]: !current });
  }

  // ── Armor toggle (use/unuse) ──────────────────────────────────────────────────

  static async _onToggleArmor(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item || item.type !== 'armor') return;
    await item.update({ 'system.use': !item.system.use });
  }

  // ── Favorite ─────────────────────────────────────────────────────────────────

  static async _onToggleFavorite(event, target) {
    const row    = target.closest('[data-item-id]');
    const itemId = row?.dataset.itemId;
    if (!itemId) return;
    const favs = new Set(this.actor.getFlag('New-CWN-Sheets', 'favorites') ?? []);
    if (favs.has(itemId)) favs.delete(itemId); else favs.add(itemId);
    await this.actor.setFlag('New-CWN-Sheets', 'favorites', [...favs]);
  }

  // ── Lock toggle ─────────────────────────────────────────────────────────────

  async _onToggleLock(event, target) {
    const locked = !this.element.classList.contains('cwn-locked');
    this.element.classList.toggle('cwn-locked', locked);
    this.element.querySelectorAll('.lock-indicator').forEach(el => {
      el.classList.toggle('locked', locked);
    });
    await this.actor.setFlag('New-CWN-Sheets', 'sheetLocked', locked);
  }

  // ── Section collapse ─────────────────────────────────────────────────────────

  async _onToggleSection(event, target) {
    const key = target.dataset.sectionKey;
    if (!key) return;

    if (this.#collapsedSections.has(key)) this.#collapsedSections.delete(key);
    else this.#collapsedSections.add(key);

    const content = this.element.querySelector(`[data-section-content="${key}"]`);
    const chevron = target.querySelector('.section-chevron');
    content?.classList.toggle('collapsed');
    chevron?.classList.toggle('rotated');
  }

  // ── Item description toggle ─────────────────────────────────────────────────

  static async _onToggleItemDescription(event, target) {
    const row  = target.closest('[data-item-id]');
    const desc = row?.nextElementSibling;
    if (desc?.classList.contains('item-description-row')) {
      desc.classList.toggle('hidden');
    }
  }

  // ── Roll actions ─────────────────────────────────────────────────────────────

  static async _onRoll(event, target) {
    event.preventDefault();
    if (target.dataset.rollType === 'item') {
      const item = this._getEmbeddedDocument(target);
      if (item) return item.roll?.(event);
    }
    if (target.dataset.roll) {
      const roll = new Roll(target.dataset.roll, this.actor.getRollData());
      await roll.toMessage({
        speaker:  ChatMessage.getSpeaker({ actor: this.actor }),
        flavor:   target.dataset.label ? `[${target.dataset.label}]` : '',
        rollMode: game.settings.get('core', 'rollMode'),
      });
    }
  }

  static async _onRollSave(event, target) {
    const saveType = target.dataset.saveType;
    if (saveType && typeof this.actor.system.rollSave === 'function') {
      await this.actor.system.rollSave(saveType);
    }
  }

  static async _onSkillRoll(event, target) {
    this._getEmbeddedDocument(target)?.roll?.(event);
  }

  static async _onRollUnskilled(event, target) {
    // Create an ephemeral skill item with rank -1 so it uses the
    // system's standard skill roll dialog (which asks for an attribute)
    const itemData = {
      name: "Unskilled",
      type: "skill",
      system: { rank: -1 }
    };
    const item = new Item.implementation(itemData, { parent: this.actor });
    return item.roll?.(event);
  }

  static async _onRollStats(event, target) {
    ui.notifications.info('Roll stats: not yet implemented.');
  }

  // ── Reload ────────────────────────────────────────────────────────────────────

  static async _onReload(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item || item.type !== 'weapon') return;
    const max = item.system.ammo?.max ?? 0;
    await item.update({ 'system.ammo.value': max });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p>Reloaded <strong>${item.name}</strong>.</p>`,
    });
  }

  // ── Rest / Scene ─────────────────────────────────────────────────────────────

  static async _onRest(event, target) {
    event.preventDefault();
    const choice = await foundry.applications.api.DialogV2.wait({
      window:      { title: 'Rest for the Night' },
      content:     '<p>Normal rest or no HP recovery (frail)?</p>',
      rejectClose: false,
      modal:       true,
      buttons: [
        { icon: 'fas fa-moon',    label: 'Normal Rest',    action: 'normal' },
        { icon: 'fas fa-band-aid',label: 'No HP (Frail)',  action: 'frail' },
        { icon: 'fas fa-times',   label: 'Cancel',         action: 'cancel' },
      ],
    });
    if (!choice || choice === 'cancel') return;
    await globalThis.swnr?.utils?.refreshActor({
      actor: this.actor, cadence: 'day', frail: choice === 'frail',
    });
  }

  static async _onScene(event, target) {
    await globalThis.swnr?.utils?.refreshActor({ actor: this.actor, cadence: 'scene' });
    // Reset soak to max after scene refresh
    const soak = this.actor.getFlag('New-CWN-Sheets', 'soak');
    if (soak?.max !== undefined) {
      soak.value = soak.max;
      await this.actor.setFlag('New-CWN-Sheets', 'soak', soak);
    }
  }

  // ── Hit dice ──────────────────────────────────────────────────────────────────

  static async _onHitDice(event, target) {
    if (typeof this.actor.system.rollHitDice === 'function') {
      await this.actor.system.rollHitDice(true);
    }
  }

  // ── Credits ───────────────────────────────────────────────────────────────────

  static async _onCreditChange(event, target) {
    const currencyType = target.dataset.currencyType ?? 'base';
    await foundry.applications.api.DialogV2.prompt({
      window:      { title: `Adjust ${currencyType}` },
      content:     `<p>Adjust ${currencyType} (negative to subtract):</p><input type="number" name="amount" value="0" style="width:100%">`,
      modal:       false,
      rejectClose: false,
      ok: {
        label:    'Apply',
        callback: async (_e, button) => {
          const amount = parseInt(button.form.elements.amount.value);
          if (isNaN(amount)) return;
          if (currencyType === 'base') {
            const old = this.actor.system.credits.carriedBase;
            await this.actor.update({ 'system.credits.carriedBase': old + amount });
          } else {
            const idx  = parseInt(target.dataset.currencyIdx);
            const list = foundry.utils.deepClone(this.actor.system.credits.extraCurrencies);
            if (!list[idx]) return;
            list[idx].value += amount;
            await this.actor.update({ 'system.credits.extraCurrencies': list });
          }
        },
      },
    });
  }

  // ── Uses ──────────────────────────────────────────────────────────────────────

  static async _onAddUse(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item) return;
    const cur = item.system.uses?.value ?? 0;
    const max = item.system.uses?.max   ?? cur;
    await item.update({ 'system.uses.value': Math.min(cur + 1, max) });
  }

  static async _onRemoveUse(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item) return;
    const cur = item.system.uses?.value ?? 0;
    await item.update({ 'system.uses.value': Math.max(cur - 1, 0) });
  }

  // ── Power commitments ─────────────────────────────────────────────────────────

  static async _onReleaseCommitment(event, target) {
    ui.notifications.info('Release commitment: not yet implemented.');
  }

  static async _onResetPowerUses(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item) return;
    const max = item.system.uses?.max ?? 0;
    await item.update({ 'system.uses.value': max });
  }

  // ── Luck Roll ─────────────────────────────────────────────────────────────────

  static async _onRollLuck(event, target) {
    event.preventDefault();

    // Determine luck save target — CWN uses system.save.luck
    const luckTarget = this.actor.system.save?.luck ?? 11;

    // Roll 1d20
    const roll = new Roll('1d20');
    await roll.evaluate();
    const result = roll.total;
    const success = result >= luckTarget;

    // Show the slot machine dialog first, then post to chat on acceptance
    const accepted = await CWNCharacterSheet._showLuckSpinDialog(this.actor, result, luckTarget, success);
    if (accepted) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor:  `<strong>${this.actor.name}</strong> — Luck Save (need ${luckTarget})`,
        rollMode: game.settings.get('core', 'rollMode'),
      });
    }
  }

  static async _showLuckSpinDialog(actor, rolled, target, success) {
    // Symbol pools
    const successSymbols = ['⭐','💎','⚡','🔥','◆','★'];
    const failSymbols    = ['☠','👁','⬡','✗','◈','⊘','▲'];
    const spinPool       = [...successSymbols, ...failSymbols];

    // Final reel faces
    const finalFace = success
      ? (() => { const s = successSymbols[Math.floor(Math.random() * successSymbols.length)]; return [s,s,s]; })()
      : (() => {
          // Guarantee all three are different
          const pick = () => failSymbols[Math.floor(Math.random() * failSymbols.length)];
          let a = pick(), b = pick(), c = pick();
          while (b === a) b = pick();
          while (c === a || c === b) c = pick();
          return [a, b, c];
        })();

    const color  = success ? '#00ff88' : '#ff2255';
    const label  = success
      ? `SUCCESS — Rolled ${rolled} vs ${target}`
      : `FAILURE — Rolled ${rolled} vs ${target}`;
    const sublabel = success
      ? 'LUCK HOLDS — THE CITY BENDS IN YOUR FAVOUR'
      : 'LUCK SPENT — THE CITY TAKES ITS TOLL';

    return new Promise(resolve => {
      const content = `
        <div style="font-family:'Share Tech Mono',monospace;text-align:center;padding:10px 14px 6px;background:#020509;border-radius:4px;min-width:290px">
          <div style="font-family:monospace;font-size:13px;letter-spacing:0.28em;color:#00e8ff;text-shadow:0 0 8px #00e8ff44;margin-bottom:14px;text-transform:uppercase">
            LUCK TERMINAL — ${actor.name}
          </div>
          <div style="display:flex;gap:10px;justify-content:center;margin-bottom:16px">
            <div id="luck-reel-0" style="width:66px;height:66px;border:1px solid #00e8ff33;border-radius:4px;background:#010810;display:flex;align-items:center;justify-content:center;font-size:32px">?</div>
            <div id="luck-reel-1" style="width:66px;height:66px;border:1px solid #00e8ff33;border-radius:4px;background:#010810;display:flex;align-items:center;justify-content:center;font-size:32px">?</div>
            <div id="luck-reel-2" style="width:66px;height:66px;border:1px solid #00e8ff33;border-radius:4px;background:#010810;display:flex;align-items:center;justify-content:center;font-size:32px">?</div>
          </div>
          <div id="luck-result" style="opacity:0;transition:opacity 0.5s">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.1em;color:${color};margin-bottom:4px">${label}</div>
            <div style="font-size:9px;letter-spacing:0.2em;color:#3a6672;text-transform:uppercase">${sublabel}</div>
          </div>
        </div>`;

      const d = new Dialog({
        title:   `LUCK SAVE — ${actor.name}`,
        content,
        buttons: {
          accept: { label: success ? '✓ FATE ACCEPTED' : '✗ ACCEPT FAILURE', callback: () => resolve(true) }
        },
        default: 'accept',
        render: htmlEl => {
          const el     = htmlEl instanceof HTMLElement ? htmlEl : htmlEl[0];
          const reels  = [0,1,2].map(i => el.querySelector(`#luck-reel-${i}`));
          const resEl  = el.querySelector('#luck-result');
          let ticks    = 0;
          const maxTicks = 26;

          const iv = setInterval(() => {
            ticks++;
            reels.forEach((r, i) => {
              if (!r) return;
              if (ticks < maxTicks - i * 5) {
                r.textContent = spinPool[Math.floor(Math.random() * spinPool.length)];
              } else if (!r.dataset.locked) {
                r.textContent      = finalFace[i];
                r.dataset.locked   = '1';
                r.style.borderColor = color;
                r.style.boxShadow   = `0 0 14px ${color}66`;
                r.style.color       = color;
                r.style.transition  = 'border-color 0.3s, box-shadow 0.3s';
              }
            });
            if (ticks >= maxTicks + 4) {
              clearInterval(iv);
              if (resEl) resEl.style.opacity = '1';
            }
          }, 70);
        },
      });
      d.render(true);
    });
  }
}
