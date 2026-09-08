/**
 * CWNDroneSheet — cwn-drone-sheet.mjs
 *
 * Vendit-family Drone sheet for CWN / SWN.
 * Drones extend the vehicle base — same systems/power/hardpoints,
 * plus: fittings, range, model, move type, and a pilot link.
 */

import { prepareEffectsForRender } from '../helpers/effects.mjs';

const { api, sheets } = foundry.applications;

export class CWNDroneSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

  #dragDrop;
  #collapsedSections = new Set();

  constructor(options = {}) {
    super(options);
    this.#dragDrop = this._createDragDropHandlers();
  }

  static DEFAULT_OPTIONS = {
    classes: ['cwn-sheet', 'cwn-drone-sheet', 'actor', 'drone'],
    position: { width: 680, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true },
    dragDrop: [{ dragSelector: '[data-drag]', dropSelector: null }],
    actions: {
      onEditImage:           CWNDroneSheet._onEditImage,
      viewDoc:               CWNDroneSheet._viewDoc,
      createDoc:             CWNDroneSheet._createDoc,
      deleteDoc:             CWNDroneSheet._deleteDoc,
      toggleEffect:          CWNDroneSheet._toggleEffect,
      createEffect:          CWNDroneSheet._createEffect,
      viewEffect:            CWNDroneSheet._viewEffect,
      deleteEffect:          CWNDroneSheet._deleteEffect,
      roll:                  CWNDroneSheet._onRoll,
      toggleSection:         CWNDroneSheet._onToggleSection,
      toggleItemDescription: CWNDroneSheet._onToggleItemDescription,
      toggleLock:            CWNDroneSheet._onToggleLock,
      assignPilot:           CWNDroneSheet._onAssignPilot,
      removePilot:           CWNDroneSheet._onRemovePilot,
      openPilot:             CWNDroneSheet._onOpenPilot,
    },
  };

  static PARTS = {
    header:  { template: 'modules/New-CWN-Sheets/templates/actor/drone/header.hbs' },
    tabs:    { template: 'templates/generic/tab-navigation.hbs' },
    systems: { template: 'modules/New-CWN-Sheets/templates/actor/drone/systems.hbs' },
    weapons: { template: 'modules/New-CWN-Sheets/templates/actor/drone/weapons.hbs' },
    notes:   { template: 'modules/New-CWN-Sheets/templates/actor/drone/notes.hbs' },
    effects: { template: 'modules/New-CWN-Sheets/templates/actor/drone/effects.hbs' },
  };

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = ['header', 'tabs', 'systems', 'weapons', 'notes', 'effects'];
  }

  async _prepareContext(options) {
    const actor  = this.actor;
    const system = actor.system;
    const fields = actor.schema?.fields ?? {};
    const systemFields = actor.system.schema?.fields ?? {};

    // Resolve model display name
    let modelDisplay = system.model ?? '';
    if (system.model === 'custom') {
      modelDisplay = system.customModel || 'Custom';
    } else if (CONFIG.SWN?.DroneModelsData?.[system.model]) {
      modelDisplay = game.i18n.localize(`swnr.sheet.drone.models.${system.model}`) || system.model;
    }

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
      modelDisplay,
      droneModels: CONFIG.SWN?.DroneModelsData ?? {},
      modelChoices: this._buildModelChoices(),
    };

    await this._prepareItems(context);
    this._prepareEffects(context);
    this._preparePilot(context);

    return context;
  }

  _buildModelChoices() {
    const choices = {};
    const data = CONFIG.SWN?.DroneModelsData ?? {};
    for (const key of Object.keys(data)) {
      choices[key] = game.i18n.localize(`swnr.sheet.drone.models.${key}`) || key;
    }
    choices['custom'] = game.i18n.localize('swnr.sheet.drone.models.custom') || 'Custom';
    return choices;
  }

  async _preparePartContext(partId, context) {
    switch (partId) {
      case 'systems':
      case 'weapons':
      case 'effects':
        context.tab = context.tabs[partId];
        break;
      case 'notes': {
        context.tab = context.tabs[partId];
        const TextEditorImpl = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;
        context.enrichedDescription = await TextEditorImpl.enrichHTML(
          this.actor.system.description ?? '',
          { secrets: this.document.isOwner, relativeTo: this.actor }
        );
        context.enrichedMods = await TextEditorImpl.enrichHTML(
          this.actor.system.mods ?? '',
          { secrets: this.document.isOwner, relativeTo: this.actor }
        );
        break;
      }
    }
    return context;
  }

  _getTabs(parts) {
    const tabGroup = 'primary';
    if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = 'systems';
    const TAB_DEFS = {
      systems: { id: 'systems', label: 'Systems',  icon: 'fa-microchip' },
      weapons: { id: 'weapons', label: 'Weapons',  icon: 'fa-crosshairs' },
      notes:   { id: 'notes',   label: 'Notes',    icon: 'fa-book-open' },
      effects: { id: 'effects', label: 'Effects',  icon: 'fa-star-half-stroke' },
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
    const actor = this.actor;
    const TextEditorImpl = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;

    const shipWeapons  = [];
    const shipFittings = [];
    const weapons      = [];

    for (const item of actor.items) {
      if (item.system?.description && !item.system.enrichedDescription) {
        item.system.enrichedDescription = await TextEditorImpl.enrichHTML(
          item.system.description,
          { secrets: this.document.isOwner, relativeTo: this.actor }
        );
      }
      switch (item.type) {
        case 'shipWeapon':  shipWeapons.push(item);  break;
        case 'shipFitting': shipFittings.push(item); break;
        case 'weapon':      weapons.push(item);      break;
      }
    }

    const bySort = (a, b) => (a.sort || 0) - (b.sort || 0);
    Object.assign(context, {
      shipWeapons:  shipWeapons.sort(bySort),
      shipFittings: shipFittings.sort(bySort),
      weapons:      weapons.sort(bySort),
    });
  }

  _prepareEffects(context) {
    context.effects = prepareEffectsForRender(this.actor);
  }

  _preparePilot(context) {
    const pilotId = this.actor.system.crewMembers?.[0];
    context.pilot = pilotId ? (game.actors?.get(pilotId) ?? null) : null;
    // Also expose the derived pilot from the data model if available
    context.pilotActor = this.actor.system.pilot ?? context.pilot;
  }

  _onRender(context, options) {
    this.#dragDrop.forEach(d => d.bind(this.element));

    // ── Restore lock state from flag ───────────────────────────────────────
    const locked = this.actor.getFlag('New-CWN-Sheets', 'sheetLocked');
    if (locked) {
      this.element.classList.add('cwn-locked');
      this.element.querySelectorAll('.lock-indicator').forEach(el => {
        el.classList.add('locked');
      });
    }

    const tabGroup  = 'primary';
    const activeTab = this.tabGroups[tabGroup] || 'systems';
    this.element.querySelectorAll('nav.tabs [data-tab]').forEach(tab =>
      tab.classList.toggle('active', tab.dataset.tab === activeTab));
    this.element.querySelectorAll('.cwn-tab[data-tab]').forEach(content => {
      const isActive = content.dataset.tab === activeTab;
      content.classList.toggle('active', isActive);
      if (isActive) content.style.display = '';
    });
    this._applyCollapsedStates();
  }

  _applyCollapsedStates() {
    for (const key of this.#collapsedSections) {
      const content = this.element.querySelector(`[data-section-content="${key}"]`);
      if (content) content.classList.add('collapsed');
    }
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
    const row  = event.currentTarget.closest('[data-item-id]');
    const item = row && this.actor.items.get(row.dataset.itemId);
    if (item) event.dataTransfer.setData('text/plain', JSON.stringify(item.toDragData()));
  }
  async _onDrop(event) {
    const TextEditorImpl = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;
    const data    = TextEditorImpl.getDragEventData(event);
    const allowed = Hooks.call('dropActorSheetData', this.actor, this, data);
    if (allowed === false) return;
    if (data.type === 'Item')  return this._onDropItem(event, data);
    if (data.type === 'Actor') return this._onDropActorAsPilot(event, data);
  }
  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    if (this.actor.uuid === item.parent?.uuid) return;
    return this.actor.createEmbeddedDocuments('Item', [item.toObject()]);
  }
  async _onDropActorAsPilot(event, data) {
    if (!this.actor.isOwner) return;
    const dropped = await Actor.implementation.fromDropData(data);
    if (!dropped || !['character', 'npc'].includes(dropped.type)) return;
    await this.actor.update({ 'system.crewMembers': [dropped.id] });
  }

  _getEmbeddedDocument(target) {
    const row = target.closest('[data-item-id]');
    return row ? (this.actor.items.get(row.dataset.itemId) ?? null) : null;
  }

  // ── Static actions ──────────────────────────────────────────────────────────

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
      window: { title: `Delete ${doc.name}?` },
      content: `<p>Delete <strong>${doc.name}</strong>?</p>`,
      yes: { callback: () => doc.delete() },
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
    if (target.dataset.rollType === 'item') this._getEmbeddedDocument(target)?.roll?.(event);
  }
  async _onToggleSection(event, target) {
    const key = target.dataset.sectionKey;
    if (!key) return;
    if (this.#collapsedSections.has(key)) this.#collapsedSections.delete(key);
    else this.#collapsedSections.add(key);
    this.element.querySelector(`[data-section-content="${key}"]`)?.classList.toggle('collapsed');
    target.querySelector('.section-chevron')?.classList.toggle('rotated');
  }
  static async _onToggleItemDescription(event, target) {
    const row  = target.closest('[data-item-id]');
    const desc = row?.nextElementSibling;
    if (desc?.classList.contains('item-description-row')) desc.classList.toggle('hidden');
  }
  async _onToggleLock(event, target) {
    const locked = !this.element.classList.contains('cwn-locked');
    this.element.classList.toggle('cwn-locked', locked);
    this.element.querySelectorAll('.lock-indicator').forEach(el => el.classList.toggle('locked', locked));
    await this.actor.setFlag('New-CWN-Sheets', 'sheetLocked', locked);
  }
  static async _onAssignPilot() {
    ui.notifications.info('Drop a Character or NPC actor onto the sheet to assign a pilot.');
  }
  static async _onRemovePilot() {
    await this.actor.update({ 'system.crewMembers': [] });
  }
  static async _onOpenPilot() {
    const pilotId = this.actor.system.crewMembers?.[0];
    if (pilotId) game.actors?.get(pilotId)?.sheet.render(true);
  }
}
