/**
 * CWNVehicleSheet — cwn-vehicle-sheet.mjs
 *
 * Vendit-family Vehicle sheet for CWN / SWN.
 * Covers: HP, AC, armor, power/mass/hardpoints, cargo, weapons,
 *         fittings, crew, mods, and description.
 */

import { prepareEffectsForRender } from '../helpers/effects.mjs';

const { api, sheets } = foundry.applications;

export class CWNVehicleSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

  #dragDrop;
  #collapsedSections = new Set();

  constructor(options = {}) {
    super(options);
    this.#dragDrop = this._createDragDropHandlers();
  }

  static DEFAULT_OPTIONS = {
    classes: ['cwn-sheet', 'cwn-vehicle-sheet', 'actor', 'vehicle'],
    position: { width: 720, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true },
    dragDrop: [{ dragSelector: '[data-drag]', dropSelector: null }],
    actions: {
      onEditImage:           CWNVehicleSheet._onEditImage,
      viewDoc:               CWNVehicleSheet._viewDoc,
      createDoc:             CWNVehicleSheet._createDoc,
      deleteDoc:             CWNVehicleSheet._deleteDoc,
      toggleEffect:          CWNVehicleSheet._toggleEffect,
      createEffect:          CWNVehicleSheet._createEffect,
      viewEffect:            CWNVehicleSheet._viewEffect,
      deleteEffect:          CWNVehicleSheet._deleteEffect,
      roll:                  CWNVehicleSheet._onRoll,
      toggleSection:         CWNVehicleSheet._onToggleSection,
      toggleItemDescription: CWNVehicleSheet._onToggleItemDescription,
      toggleLock:            CWNVehicleSheet._onToggleLock,
      addCrewMember:         CWNVehicleSheet._onAddCrewMember,
      removeCrewMember:      CWNVehicleSheet._onRemoveCrewMember,
    },
  };

  static PARTS = {
    header:  { template: 'modules/New-CWN-Sheets/templates/actor/vehicle/header.hbs' },
    tabs:    { template: 'templates/generic/tab-navigation.hbs' },
    systems: { template: 'modules/New-CWN-Sheets/templates/actor/vehicle/systems.hbs' },
    weapons: { template: 'modules/New-CWN-Sheets/templates/actor/vehicle/weapons.hbs' },
    cargo:   { template: 'modules/New-CWN-Sheets/templates/actor/vehicle/cargo.hbs' },
    notes:   { template: 'modules/New-CWN-Sheets/templates/actor/vehicle/notes.hbs' },
    effects: { template: 'modules/New-CWN-Sheets/templates/actor/vehicle/effects.hbs' },
  };

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = ['header', 'tabs', 'systems', 'weapons', 'cargo', 'notes', 'effects'];
  }

  async _prepareContext(options) {
    const actor  = this.actor;
    const system = actor.system;
    const fields = actor.schema?.fields ?? {};
    const systemFields = actor.system.schema?.fields ?? {};

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
    };

    await this._prepareItems(context);
    this._prepareEffects(context);
    this._prepareCrew(context);

    return context;
  }

  async _preparePartContext(partId, context) {
    switch (partId) {
      case 'systems':
      case 'weapons':
      case 'cargo':
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
      systems: { id: 'systems', label: 'Systems',  icon: 'fa-gauge-high' },
      weapons: { id: 'weapons', label: 'Weapons',  icon: 'fa-crosshairs' },
      cargo:   { id: 'cargo',   label: 'Cargo',    icon: 'fa-boxes-stacked' },
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
    const actor  = this.actor;
    const TextEditorImpl = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;

    const shipWeapons  = [];
    const shipDefenses = [];
    const shipFittings = [];
    const weapons      = [];
    const gear         = [];

    for (const item of actor.items) {
      if (item.system?.description && !item.system.enrichedDescription) {
        item.system.enrichedDescription = await TextEditorImpl.enrichHTML(
          item.system.description,
          { secrets: this.document.isOwner, relativeTo: this.actor }
        );
      }
      switch (item.type) {
        case 'shipWeapon':  shipWeapons.push(item);  break;
        case 'shipDefense': shipDefenses.push(item); break;
        case 'shipFitting': shipFittings.push(item); break;
        case 'weapon':      weapons.push(item);      break;
        case 'item':        gear.push(item);         break;
        case 'armor':       gear.push(item);         break;
      }
    }

    const bySort = (a, b) => (a.sort || 0) - (b.sort || 0);
    Object.assign(context, {
      shipWeapons:  shipWeapons.sort(bySort),
      shipDefenses: shipDefenses.sort(bySort),
      shipFittings: shipFittings.sort(bySort),
      weapons:      weapons.sort(bySort),
      gear:         gear.sort(bySort),
    });
  }

  _prepareEffects(context) {
    context.effects = prepareEffectsForRender(this.actor);
  }

  _prepareCrew(context) {
    const crewIds = this.actor.system.crewMembers ?? [];
    const crewActors = crewIds
      .map(id => game.actors?.get(id))
      .filter(Boolean);
    context.crewActors = crewActors;
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
    if (data.type === 'Item') return this._onDropItem(event, data);
    if (data.type === 'Actor') return this._onDropActor(event, data);
  }
  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    if (this.actor.uuid === item.parent?.uuid) return;
    return this.actor.createEmbeddedDocuments('Item', [item.toObject()]);
  }
  async _onDropActor(event, data) {
    if (!this.actor.isOwner) return;
    const dropped = await Actor.implementation.fromDropData(data);
    if (!dropped) return;
    const current = foundry.utils.deepClone(this.actor.system.crewMembers ?? []);
    if (!current.includes(dropped.id)) {
      current.push(dropped.id);
      await this.actor.update({ 'system.crewMembers': current });
    }
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
  static async _onAddCrewMember() {
    ui.notifications.info('Drop an Actor onto the sheet to add a crew member.');
  }
  static async _onRemoveCrewMember(event, target) {
    const actorId = target.dataset.actorId;
    if (!actorId) return;
    const current = (this.actor.system.crewMembers ?? []).filter(id => id !== actorId);
    await this.actor.update({ 'system.crewMembers': current });
  }
}
