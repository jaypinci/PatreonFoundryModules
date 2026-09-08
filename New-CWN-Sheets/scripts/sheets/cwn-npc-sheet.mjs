/**
 * CWNNpcSheet — cwn-npc-sheet.mjs
 *
 * Vendit-family NPC sheet for CWN (Cities Without Number).
 * Covers: HP, AC, saves, attack, skills, features, cyberware,
 *         powers, gear, and enriched notes/biography.
 */

import { prepareEffectsForRender } from '../helpers/effects.mjs';

const { api, sheets } = foundry.applications;

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

export class CWNNpcSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

  #dragDrop;
  #collapsedSections = new Set();
  #expandedAttacks = new Set();

  constructor(options = {}) {
    super(options);
    this.#dragDrop = this._createDragDropHandlers();
  }

  static DEFAULT_OPTIONS = {
    classes: ['cwn-sheet', 'cwn-npc-sheet', 'actor', 'npc'],
    position: { width: 700, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true },
    dragDrop: [{ dragSelector: '[data-drag]', dropSelector: null }],
    actions: {
      onEditImage:           CWNNpcSheet._onEditImage,
      viewDoc:               CWNNpcSheet._viewDoc,
      createDoc:             CWNNpcSheet._createDoc,
      deleteDoc:             CWNNpcSheet._deleteDoc,
      toggleEffect:          CWNNpcSheet._toggleEffect,
      createEffect:          CWNNpcSheet._createEffect,
      viewEffect:            CWNNpcSheet._viewEffect,
      deleteEffect:          CWNNpcSheet._deleteEffect,
      rollAttack:             CWNNpcSheet._onRollAttack,
      reload:                 CWNNpcSheet._onReload,
      rollUnskilled:          CWNNpcSheet._onRollUnskilled,
      roll:                   CWNNpcSheet._onRoll,
      rollSave:              CWNNpcSheet._onRollSave,
      rollMorale:            CWNNpcSheet._onRollMorale,
      rollHitDice:           CWNNpcSheet._onRollHitDice,
      rollSkill:             CWNNpcSheet._onSkillRoll,
      skillUp:               CWNNpcSheet._onSkillUp,
      scene:                 CWNNpcSheet._onScene,
      toggleSection:         CWNNpcSheet._onToggleSection,
      toggleItemDescription: CWNNpcSheet._onToggleItemDescription,
      toggleAttackDetails:   CWNNpcSheet._onToggleAttackDetails,
      toggleLock:            CWNNpcSheet._onToggleLock,
      toggleFavorite:        CWNNpcSheet._onToggleFavorite,
      addUse:                CWNNpcSheet._onAddUse,
      removeUse:             CWNNpcSheet._onRemoveUse,
      resetPowerUses:        CWNNpcSheet._onResetPowerUses,
      postToChat:            CWNNpcSheet._onPostToChat,
      creditChange:          CWNNpcSheet._onCreditChange,
    },
  };

  static PARTS = {
    header: { template: 'modules/New-CWN-Sheets/templates/actor/npc/header.hbs' },
    tabs:   { template: 'templates/generic/tab-navigation.hbs' },
    combat: { template: 'modules/New-CWN-Sheets/templates/actor/npc/combat.hbs' },
    gear:   { template: 'modules/New-CWN-Sheets/templates/actor/npc/gear.hbs' },
    notes:  { template: 'modules/New-CWN-Sheets/templates/actor/npc/notes.hbs' },
    effects:{ template: 'modules/New-CWN-Sheets/templates/actor/npc/effects.hbs' },
  };

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = ['header', 'tabs', 'combat', 'gear', 'notes', 'effects'];
  }

  async _prepareContext(options) {
    const actor  = this.actor;
    const system = actor.system;
    const fields = actor.schema?.fields ?? {};
    const systemFields = actor.system.schema?.fields ?? {};

    // Get soak from flags, initialize if not present
    let soak = actor.getFlag('New-CWN-Sheets', 'soak');
    if (!soak) {
      soak = { value: 0, max: 0 };
      await actor.setFlag('New-CWN-Sheets', 'soak', soak);
    }
    system.soak = soak;

    // Read combat info from flags — do NOT write defaults here.
    // Writing flags in _prepareContext triggers actor.update() which
    // re-renders the sheet and races against submitOnChange, causing
    // field edits to be overwritten with stale data.
    const savedInfo  = actor.getFlag('New-CWN-Sheets', 'combatInfo') ?? {};
    const combatInfo = {
      saves:      savedInfo.saves      ?? 10,
      moralScore: savedInfo.moralScore ?? 7,
      skillBonus: savedInfo.skillBonus ?? 0,
      ...savedInfo,
    };

    const context = {
      editable: this.isEditable,
      owner:    actor.isOwner,
      limited:  actor.limited,
      actor, system, flags: actor.flags,
      config: CONFIG.SWN,
      tabs: this._getTabs(options.parts),
      fields, systemFields,
      collapsedSections: this.#collapsedSections,
      moduleId: 'New-CWN-Sheets',
      combatInfo,
    };

    await this._prepareItems(context);
    this._prepareEffects(context);
    this._preparePools(context);

    return context;
  }

  /** @override */
  _onChangeInput(event) {
    const input = event.target;
    const name  = input.name;
    if (name === 'system.attacks.damage' && input.value)
      input.value = input.value.replace(/,/g, '').replace(/[\[\]]/g, '');
    if (name === 'system.ab' || name === 'system.baseAc') {
      const v = parseInt(input.value, 10);
      if (!isNaN(v)) input.value = v;
    }
    super._onChangeInput(event);
  }

  /** @override */
  _prepareSubmitData(event, form, formData) {
    // formData is a FormDataExtended instance. Its .object getter expands
    // flat entries into a nested object each call — mutating .object doesn't
    // update the underlying entries. We must use .set() on the flat keys.

    const ab  = formData.get('system.ab');
    const ac  = formData.get('system.baseAc');
    const dmg = formData.get('system.attacks.damage');

    if (ab  !== null) formData.set('system.ab',              String(parseInt(ab,  10) || 0));
    if (ac  !== null) formData.set('system.baseAc',          String(parseInt(ac,  10) || 10));
    if (dmg !== null) formData.set('system.attacks.damage',  String(dmg).replace(/,/g, '').replace(/[\[\]]/g, ''));

    return super._prepareSubmitData(event, form, formData);
  }

  async _preparePartContext(partId, context) {
    switch (partId) {
      case 'combat':
      case 'gear':
      case 'effects':
        context.tab = context.tabs[partId];
        break;
      case 'notes': {
        context.tab = context.tabs[partId];
        const TextEditorImpl = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;
        context.enrichedBiography = (await TextEditorImpl.enrichHTML(
          this.actor.system.biography ?? '',
          { secrets: this.document.isOwner, relativeTo: this.actor }
        )) ?? '';
        const notes = this.actor.system.notes ?? { left: {}, right: {}, public: {} };
        context.enrichedNotesLeft   = (await TextEditorImpl.enrichHTML(notes.left?.contents  ?? '', { secrets: this.document.isOwner, relativeTo: this.actor })) ?? '';
        context.enrichedNotesRight  = (await TextEditorImpl.enrichHTML(notes.right?.contents ?? '', { secrets: this.document.isOwner, relativeTo: this.actor })) ?? '';
        context.enrichedNotesPublic = (await TextEditorImpl.enrichHTML(notes.public?.contents ?? '', { secrets: this.document.isOwner, relativeTo: this.actor })) ?? '';
        break;
      }
    }
    return context;
  }

  _getTabs(parts) {
    const tabGroup = 'primary';
    if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = 'combat';
    const TAB_DEFS = {
      combat:  { id: 'combat',  label: 'Combat',  icon: 'fa-crosshairs' },
      gear:    { id: 'gear',    label: 'Gear',    icon: 'fa-bag-shopping' },
      notes:   { id: 'notes',   label: 'Notes',   icon: 'fa-book-open' },
      effects: { id: 'effects', label: 'Effects', icon: 'fa-star-half-stroke' },
    };
    return parts.reduce((tabs, partId) => {
      const def = TAB_DEFS[partId];
      if (!def) return tabs;
      tabs[partId] = {
        cssClass: this.tabGroups[tabGroup] === def.id ? 'active' : '',
        group: tabGroup, id: def.id, icon: def.icon, label: def.label,
      };
      return tabs;
    }, {});
  }

  async _prepareItems(context) {
    const actor     = this.actor;
    const MODULE_ID = 'New-CWN-Sheets';
    const favorites = new Set(actor.getFlag(MODULE_ID, 'favorites') ?? []);
    const TextEditorImpl = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;

    const weapons = [], armor = [], gear = [], consumables = [];
    const skills = [], features = [], powersByType = {};
    const cyberByLocation = {};
    for (const loc of Object.keys(CYBER_LOCATIONS)) cyberByLocation[loc] = [];

    for (const item of actor.items) {
      item.isFavorite = favorites.has(item.id);
      if (item.system?.description && !item.system.enrichedDescription) {
        item.system.enrichedDescription = await TextEditorImpl.enrichHTML(
          item.system.description,
          { secrets: this.document.isOwner, rollData: this.actor.getRollData(), relativeTo: this.actor }
        );
      }
      switch (item.type) {
        case 'weapon': {
          item.attackSpecial = item.getFlag(MODULE_ID, 'attackSpecial') ?? '';
          weapons.push(item);
          break;
        }
        case 'armor':   armor.push(item);    break;
        case 'skill':   skills.push(item);   break;
        case 'feature': features.push(item); break;
        case 'item': {
          const consumable = item.system?.uses?.consumable ?? 'none';
          if (consumable === 'none') gear.push(item); else consumables.push(item);
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
    weapons.sort(bySort); armor.sort(bySort); gear.sort(bySort);
    consumables.sort(bySort); features.sort(bySort);
    skills.sort((a, b) => a.name.localeCompare(b.name));

    const cyberGroups = Object.entries(CYBER_LOCATIONS)
      .map(([key, meta]) => ({ key, label: meta.label, icon: meta.icon, items: cyberByLocation[key].sort(bySort) }))
      .filter(g => g.items.length > 0);

    const readiedWeapons = weapons.filter(i => i.system?.location === 'readied');
    readiedWeapons.forEach(w => { w.attackExpanded = this.#expandedAttacks.has(w.id); });
    const favoriteItems  = actor.items.filter(i => favorites.has(i.id));

    Object.assign(context, {
      weapons, armor, gear, consumables, skills, features, cyberGroups, powersByType,
      readiedWeapons, favorites: favoriteItems, hasFavorites: favoriteItems.length > 0,
    });
  }

  _prepareEffects(context) {
    context.effects = prepareEffectsForRender(this.actor);
  }

  _preparePools(context) {
    const pools = this.actor.system.pools || {};
    const poolGroups = {};
    for (const [poolKey, poolData] of Object.entries(pools)) {
      const [resourceName, subResource] = poolKey.split(':');
      if (!poolGroups[resourceName]) poolGroups[resourceName] = { resourceName, pools: [] };
      const n = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
      const value = n(poolData.value), max = n(poolData.max);
      poolGroups[resourceName].pools.push({
        key: poolKey, subResource: subResource || 'Default', current: value, max,
        cadence: poolData.cadence, percentage: max > 0 ? Math.round((value / max) * 100) : 0,
        isEmpty: value === 0, isLow: max > 0 && value / max < 0.25,
      });
    }
    const poolGroupsArray = Object.values(poolGroups).sort((a, b) => a.resourceName.localeCompare(b.resourceName));
    context.poolGroups  = poolGroupsArray;
    context.hasAnyPools = poolGroupsArray.length > 0;
  }

  _onRender(context, options) {
    this.#dragDrop.forEach(d => d.bind(this.element));

    // Suppress Enter on all inputs — prevents accidental form submit
    this.element.querySelectorAll('input').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      });
    });

    // Header fields have no `name` attr to avoid duplicate-field conflicts
    // with combat tab inputs of the same schema path. Write directly to
    // actor on change, bypassing the form submission pipeline entirely.
    this.element.querySelectorAll('.cwn-header-field').forEach(input => {
      input.addEventListener('change', async () => {
        const field = input.dataset.headerField;
        const type  = input.dataset.fieldType;
        if (!field) return;
        let value = input.value;
        if (type === 'int')    value = parseInt(value, 10) || 0;
        if (type === 'damage') value = String(value).replace(/,/g, '').replace(/[\[\]]/g, '').trim();
        await this.actor.update({ [field]: value });
      });
    });

    // Restore lock state from flag
    const locked = this.actor.getFlag('New-CWN-Sheets', 'sheetLocked') ?? false;
    if (locked) {
      this.element.classList.add('cwn-locked');
      this.element.querySelectorAll('.lock-indicator').forEach(el => {
        el.classList.add('locked');
      });
    }

    const tabGroup  = 'primary';
    const activeTab = this.tabGroups[tabGroup] || 'combat';
    this.element.querySelectorAll('nav.tabs [data-tab]').forEach(tab =>
      tab.classList.toggle('active', tab.dataset.tab === activeTab));
    this.element.querySelectorAll('.cwn-tab[data-tab]').forEach(content => {
      const isActive = content.dataset.tab === activeTab;
      content.classList.toggle('active', isActive);
      if (isActive) content.style.display = '';
    });
    this.element.querySelectorAll('.location-selector').forEach(el =>
      el.addEventListener('change', this._onLocationChange.bind(this)));
    this._applyCollapsedStates();

    // ── Per-weapon attack "special" text — saved as a flag on the weapon item ──
    this.element.querySelectorAll('.cwn-weapon-special-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        e.stopPropagation();
        const itemId = e.currentTarget.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await item.setFlag('New-CWN-Sheets', 'attackSpecial', e.currentTarget.value);
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
    });

    // Soak input handling — manual save since not in SWN schema
    this.element.querySelectorAll('.cwn-soak-input').forEach(el => {
      el.addEventListener('change', ev => {
        ev.stopPropagation();
        this._onSoakChange(ev);
      });
    });

    // ── Combat info inputs — save to flags on change ───────────────────────
    this.element.querySelectorAll('.cwn-combat-info-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const field = e.currentTarget.dataset.combatInfoField;
        if (!field) return;
        const combatInfo = foundry.utils.deepClone(
          this.actor.getFlag('New-CWN-Sheets', 'combatInfo') ?? {}
        );
        const value = parseInt(e.currentTarget.value, 10);
        combatInfo[field] = isNaN(value) ? 0 : value;
        await this.actor.setFlag('New-CWN-Sheets', 'combatInfo', combatInfo);
      });
    });
  }

  _applyCollapsedStates() {
    for (const key of this.#collapsedSections) {
      const content = this.element.querySelector(`[data-section-content="${key}"]`);
      const chevron = this.element.querySelector(`[data-section-toggle="${key}"] .section-chevron`);
      if (content) content.classList.add('collapsed');
      if (chevron) chevron.classList.add('rotated');
    }
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

  async _onLocationChange(event) {
    const value  = event.target.value;
    const itemId = event.target.dataset.itemId;
    await this.actor.items.get(itemId)?.update({ 'system.location': value });
  }

  _createDragDropHandlers() {
    return (this.options.dragDrop || []).map(d => {
      d.permissions = { dragstart: this._canDragStart.bind(this), drop: this._canDragDrop.bind(this) };
      d.callbacks   = { dragstart: this._onDragStart.bind(this), drop: this._onDrop.bind(this) };
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
    const data = TextEditorImpl.getDragEventData(event);
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

  _getEmbeddedDocument(target) {
    const row = target.closest('[data-item-id]');
    if (!row) return null;
    return this.actor.items.get(row.dataset.itemId) ?? null;
  }

  // ── Static actions ──────────────────────────────────────────────────────────

  static async _onPostToChat(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item) return;
    const content = await renderTemplate('modules/New-CWN-Sheets/templates/chat/item-card.hbs', {
      item: item.toObject(), actor: this.actor.toObject(),
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content, style: CONST.CHAT_MESSAGE_STYLES.IC,
    });
  }

  static async _onEditImage(event, target) {
    const attr = target.dataset.edit;
    const current = foundry.utils.getProperty(this.document, attr);
    const fp = new FilePicker({
      current, type: 'image',
      callback: path => this.document.update({ [attr]: path }),
      top: this.position.top + 40, left: this.position.left + 10,
    });
    return fp.browse();
  }

  static async _viewDoc(event, target)   { this._getEmbeddedDocument(target)?.sheet.render(true); }

  static async _createDoc(event, target) {
    const type   = target.dataset.type;
    const docCls = getDocumentClass(target.dataset.documentClass ?? 'Item');
    const name   = type ? (docCls.defaultName?.({ type, parent: this.actor }) ?? `New ${type}`) : 'New Item';
    await docCls.create({ name, type }, { parent: this.actor });
  }

  static async _deleteDoc(event, target) {
    const doc = this._getEmbeddedDocument(target);
    if (!doc) return;
    if (event.shiftKey) { await doc.delete(); return; }
    await foundry.applications.api.DialogV2.confirm({
      window:  { title: `Delete ${doc.name}?` },
      content: `<p>Delete <strong>${doc.name}</strong>?</p>`,
      yes:     { callback: () => doc.delete() },
    });
  }

  static async _toggleEffect(event, target) {
    const row    = target.closest('[data-effect-id]');
    const effect = this.actor.effects.get(row?.dataset.effectId);
    if (effect) await effect.update({ disabled: !effect.disabled });
  }
  static async _createEffect() {
    await ActiveEffect.create({ name: ActiveEffect.defaultName({ parent: this.actor }), icon: 'icons/svg/aura.svg' }, { parent: this.actor });
  }
  static async _viewEffect(event, target) {
    const row = target.closest('[data-effect-id]');
    this.actor.effects.get(row?.dataset.effectId)?.sheet.render(true);
  }
  static async _deleteEffect(event, target) {
    const row    = target.closest('[data-effect-id]');
    const effect = this.actor.effects.get(row?.dataset.effectId);
    if (!effect) return;
    if (event.shiftKey) { await effect.delete(); return; }
    await foundry.applications.api.DialogV2.confirm({
      window: { title: `Delete ${effect.name}?` },
      content: `<p>Delete effect <strong>${effect.name}</strong>?</p>`,
      yes: { callback: () => effect.delete() },
    });
  }

  static async _onRoll(event, target) {
    if (target.dataset.rollType === 'item') {
      const item = this._getEmbeddedDocument(target);
      if (item) return item.roll?.(event);
    }
    // Generic attack roll — delegates to _onRollAttack with index 0
    if (target.dataset.rollType === 'attack') {
      return CWNNpcSheet._onRollAttack.call(this, event,
        Object.assign(target, { dataset: { ...target.dataset, attackIndex: '0' } })
      );
    }
  }
  static async _onRollSave(event, target) {
    const saveType = target.dataset.saveType;
    const actor = this.actor;
    const combatInfo = actor.getFlag('New-CWN-Sheets', 'combatInfo') ?? {};
    const saveDC = combatInfo.saves ?? 10;
    const roll = new Roll('1d20');
    await roll.roll();
    const result = roll.total;
    const success = result >= saveDC;
    
    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${actor.name} — ${saveType.charAt(0).toUpperCase() + saveType.slice(1)} Save (DC ${saveDC}) ${success ? '✓' : '✗'}`,
    });
  }
  static async _onRollMorale() {
    const actor = this.actor;
    const combatInfo = actor.getFlag('New-CWN-Sheets', 'combatInfo') ?? {};
    const moraleDC = combatInfo.moralScore ?? 7;
    const roll = new Roll('2d6');
    await roll.roll();
    const result = roll.total;
    const success = result >= moraleDC;
    
    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${actor.name} — Morale Check (DC ${moraleDC}) ${success ? '✓' : '✗'}`,
    });
  }
  static async _onRollUnskilled(event, target) {
    const roll = new Roll('2d6 - 1');
    await roll.roll();
    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor:  `${this.actor.name} — Unskilled Check`,
    });
  }

  static async _onRollAttack(event, target) {
    const actor = this.actor;

    // Attacks are now sourced from readied weapon items (matching the
    // character sheet). The weapon's id is passed via data-item-id on the
    // roll button or an ancestor row. If no weapon is found (e.g. an NPC
    // with no readied weapons yet), fall back to the legacy actor-level
    // attack fields so older actors still function.
    const weaponId = target.dataset.itemId ?? target.closest('[data-item-id]')?.dataset.itemId;
    const weapon   = weaponId ? actor.items.get(weaponId) : null;

    let atkLabel, bonusNum, dmgFormula, specialText;

    if (weapon) {
      atkLabel    = weapon.name?.trim() || 'Attack';
      bonusNum    = Number(weapon.system?.ab ?? 0);
      dmgFormula  = weapon.system?.damage?.trim() || 'd6';
      specialText = weapon.getFlag('New-CWN-Sheets', 'attackSpecial') ?? '';
    } else {
      atkLabel    = actor.system.attacks?.name?.trim() || 'Unarmed';
      bonusNum    = Number(actor.system.ab ?? 0);
      dmgFormula  = actor.system.attacks?.damage?.trim() || 'd6';
      specialText = actor.getFlag('New-CWN-Sheets', 'primaryAttackSpecial') ?? '';
    }

    const bonusStr = bonusNum >= 0 ? `+${bonusNum}` : `${bonusNum}`;
    const atkRoll  = new Roll(`1d20${bonusStr}`);
    const dmgRoll  = new Roll(dmgFormula);
    await atkRoll.evaluate();
    await dmgRoll.evaluate();

    // If the NPC has targets, post resolution cards against each one
    const targets = [...(game.user?.targets ?? [])];
    if (targets.length) {
      const { CWNTargetedAttack } = await import('../cwn-targeting.mjs');
      for (const token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        await CWNTargetedAttack.resolveNpcAttack(
          targetActor, token, atkLabel, atkRoll.total, dmgRoll.total, specialText, atkRoll
        );
      }
      return;
    }

    // No targets — fall back to plain rolls
    const flavorSuffix = specialText ? `<br><small><em>${specialText}</em></small>` : '';
    await atkRoll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor:  `${actor.name} — ${atkLabel} (Attack)${flavorSuffix}`,
    });
    await dmgRoll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor:  `${actor.name} — ${atkLabel} (Damage)${flavorSuffix}`,
    });
  }

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

  static async _onRollHitDice() {
    if (typeof this.actor.system.rollHitDice === 'function')
      await this.actor.system.rollHitDice(true);
  }

  // ── Scene refresh ────────────────────────────────────────────────────────────

  static async _onScene(event, target) {
    await globalThis.swnr?.utils?.refreshActor({ actor: this.actor, cadence: 'scene' });
    // Reset soak to max after scene refresh
    const soak = this.actor.getFlag('New-CWN-Sheets', 'soak');
    if (soak?.max !== undefined) {
      soak.value = soak.max;
      await this.actor.setFlag('New-CWN-Sheets', 'soak', soak);
    }
  }
  static async _onSkillRoll(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item || item.type !== 'skill') return;

    const actor     = this.actor;
    const skillName = item.name;
    const rank      = item.system?.rank ?? 0;
    const combatInfo = actor.getFlag('New-CWN-Sheets', 'combatInfo') ?? {};
    const bonus     = Number(combatInfo.skillBonus ?? 0);

    // NPCs use a flat 2d6 + skill rank + general skill bonus roll
    const formula = `2d6 + ${rank} + ${bonus}`;
    const roll = new Roll(formula);
    await roll.roll();
    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor:  `${actor.name} — ${skillName} Skill Check`,
    });
  }
  static async _onSkillUp(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item) return;
    await item.update({ 'system.rank': (item.system.rank ?? 0) + 1 });
  }
  static async _onToggleFavorite(event, target) {
    const row    = target.closest('[data-item-id]');
    const itemId = row?.dataset.itemId;
    if (!itemId) return;
    const favs = new Set(this.actor.getFlag('New-CWN-Sheets', 'favorites') ?? []);
    if (favs.has(itemId)) favs.delete(itemId); else favs.add(itemId);
    await this.actor.setFlag('New-CWN-Sheets', 'favorites', [...favs]);
  }
  async _onToggleLock(event, target) {
    const locked = !this.element.classList.contains('cwn-locked');
    this.element.classList.toggle('cwn-locked', locked);
    this.element.querySelectorAll('.lock-indicator').forEach(el => el.classList.toggle('locked', locked));
    await this.actor.setFlag('New-CWN-Sheets', 'sheetLocked', locked);
  }
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
  static async _onToggleAttackDetails(event, target) {
    const itemId = target.dataset.itemId;
    if (!itemId) return;
    if (this.#expandedAttacks.has(itemId)) this.#expandedAttacks.delete(itemId);
    else this.#expandedAttacks.add(itemId);
    const slot = this.element.querySelector(`.cwn-attack-slot[data-item-id="${itemId}"]`);
    slot?.classList.toggle('cwn-attack-expanded');
  }
  static async _onToggleItemDescription(event, target) {
    const row = target.closest('[data-item-id]');
    if (!row) return;
    const itemId = row.dataset.itemId;
    // Use a data-attribute lookup so the description row doesn't need
    // to be an immediate next sibling (works even when conditional renders change order)
    const desc = row.parentElement?.querySelector(
      `.item-description-row[data-item-id="${itemId}"]`
    );
    if (desc) desc.classList.toggle('hidden');
  }
  static async _onAddUse(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item) return;
    const cur = item.system.uses?.value ?? 0;
    const max = item.system.uses?.max ?? cur;
    await item.update({ 'system.uses.value': Math.min(cur + 1, max) });
  }
  static async _onRemoveUse(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item) return;
    await item.update({ 'system.uses.value': Math.max((item.system.uses?.value ?? 0) - 1, 0) });
  }
  static async _onResetPowerUses(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item) return;
    await item.update({ 'system.uses.value': item.system.uses?.max ?? 0 });
  }
  static async _onCreditChange(event, target) {
    await foundry.applications.api.DialogV2.prompt({
      window:      { title: 'Adjust Credits' },
      content:     `<p>Adjust credits (negative to subtract):</p><input type="number" name="amount" value="0" style="width:100%">`,
      modal:       false,
      rejectClose: false,
      ok: {
        label: 'Apply',
        callback: async (_e, button) => {
          const amount = parseInt(button.form.elements.amount.value);
          if (isNaN(amount)) return;
          const old = this.actor.system.credits.carriedBase;
          await this.actor.update({ 'system.credits.carriedBase': old + amount });
        },
      },
    });
  }
}
