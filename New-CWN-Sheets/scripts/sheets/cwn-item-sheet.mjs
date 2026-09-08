/**
 * CWN Item Sheets — cwn-item-sheet.mjs
 *
 * Dedicated ApplicationV2 item sheets for every SWN/CWN item type.
 * One shared base class + one subclass per type.
 *
 * Types covered:
 *   weapon | armor | item (gear) | skill | feature | cyberware |
 *   power  | program | asset | shipWeapon | shipFitting | shipDefense
 */

const { api, sheets } = foundry.applications;
const MODULE_ID = 'New-CWN-Sheets';

// ─────────────────────────────────────────────────────────────────────────────
//  Shared base
// ─────────────────────────────────────────────────────────────────────────────

class CWNBaseItemSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ['cwn-sheet', 'cwn-item-sheet'],
    position: { width: 520, height: 560 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      onEditImage: CWNBaseItemSheet._onEditImage,
    },
  };

  // Subclasses declare their own PARTS with a single 'body' template.

  async _prepareContext(options) {
    const item   = this.item;
    const system = item.system;
    const fields = item.schema?.fields ?? {};
    const systemFields = item.system.schema?.fields ?? {};

    const TextEditorImpl =
      foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;

    const enrichedDescription = await TextEditorImpl.enrichHTML(
      system.description ?? '',
      { secrets: this.document.isOwner, rollData: item.getRollData?.() ?? {}, relativeTo: item }
    );

    const enrichedGmNotes = system.gmNotes
      ? await TextEditorImpl.enrichHTML(system.gmNotes, { secrets: this.document.isOwner, relativeTo: item })
      : '';

    return {
      editable:   this.isEditable,
      owner:      item.isOwner,
      item,
      system,
      flags:      item.flags,
      config:     CONFIG.SWN,
      fields,
      systemFields,
      moduleId:   MODULE_ID,
      enrichedDescription,
      enrichedGmNotes,
    };
  }

  /**
   * Before the template re-renders the 'body' part, pull any live editor
   * containers OUT of the DOM and stash them. The HandlebarsApplicationMixin
   * replaces the entire part's innerHTML on every render (which `submitOnChange`
   * triggers on every field edit elsewhere on the sheet) — without this, a live
   * ProseMirror editor and any open toolbar dropdown get wiped and recreated
   * mid-interaction, which is what produces stacked/orphaned menus.
   */
  _preRender(context, options) {
    this._cwnDetachedEditors = new Map();
    this.element?.querySelectorAll('.cwn-desc-editor[data-cwn-editor-ready="true"]').forEach(div => {
      const field = div.dataset.field;
      this._cwnDetachedEditors.set(field, div);
      div.remove();
    });
    return super._preRender?.(context, options);
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Suppress Enter on all text inputs (prevents accidental form submit)
    this.element.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      });
    });

    if (!this.isEditable) return;

    this.element.querySelectorAll('.cwn-desc-editor[data-field]').forEach(async (freshDiv) => {
      const field = freshDiv.dataset.field;

      // If we detached a live editor for this field before re-render, put it
      // back in place of the freshly-templated (enriched HTML preview) div
      // instead of creating a new editor instance.
      const detached = this._cwnDetachedEditors?.get(field);
      if (detached) {
        freshDiv.replaceWith(detached);
        this._cwnDetachedEditors.delete(field);
        return;
      }

      const div = freshDiv;
      const rawValue = foundry.utils.getProperty(this.item, field) ?? '';

      // Clear the enriched HTML preview and replace with a ProseMirror editor
      div.innerHTML = '';
      const TextEditorImpl = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;
      await TextEditorImpl.create(
        {
          engine: 'prosemirror',
          target: div,
          fitToContent: false,
          editable: true,
          collaborate: false,
          content: rawValue,
        },
        rawValue,
      ).then(editor => {
        div.dataset.cwnEditorReady = 'true';
        this._cwnActiveEditors ??= new Map();
        this._cwnActiveEditors.set(div, editor);

        // Save on blur of the editor's contenteditable area
        div.addEventListener('focusout', async (ev) => {
          if (!div.contains(ev.relatedTarget)) {
            const html = editor.getData?.() ?? div.querySelector('[contenteditable]')?.innerHTML ?? rawValue;
            await this.item.update({ [field]: html });
          }
        });
      }).catch(() => {
        // Fallback: plain contenteditable
        div.dataset.cwnEditorReady = 'true';
        div.contentEditable = 'true';
        div.innerHTML = rawValue;
        div.addEventListener('focusout', async () => {
          await this.item.update({ [field]: div.innerHTML });
        });
      });
    });
  }

  /** Tear down live ProseMirror editors cleanly when the sheet closes. */
  async _preClose(options) {
    this._cwnActiveEditors?.forEach(editor => editor?.destroy?.());
    this._cwnActiveEditors?.clear();
    return super._preClose?.(options);
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
}

// ─────────────────────────────────────────────────────────────────────────────
//  Weapon
// ─────────────────────────────────────────────────────────────────────────────

export class CWNWeaponSheet extends CWNBaseItemSheet {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS,
    { classes: ['cwn-sheet', 'cwn-item-sheet', 'cwn-weapon-sheet'], position: { width: 560, height: 620 } }
  );

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/item/weapon.hbs` },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.ammoTypes   = CONFIG.SWN?.ammoTypes   ?? {};
    context.stats       = CONFIG.SWN?.stats        ?? {};
    context.saveTypes   = CONFIG.SWN?.saveTypes    ?? {};
    context.locations   = CONFIG.SWN?.itemLocations ?? {};
    context.qualities   = CONFIG.SWN?.itemQualities ?? {};
    context.conditions  = CONFIG.SWN?.gearCondition ?? {};
    return context;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Armor
// ─────────────────────────────────────────────────────────────────────────────

export class CWNArmorSheet extends CWNBaseItemSheet {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS,
    { classes: ['cwn-sheet', 'cwn-item-sheet', 'cwn-armor-sheet'], position: { width: 520, height: 580 } }
  );

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/item/armor.hbs` },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.locations  = CONFIG.SWN?.itemLocations ?? {};
    context.qualities  = CONFIG.SWN?.itemQualities ?? {};
    context.conditions = CONFIG.SWN?.gearCondition ?? {};
    return context;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Gear / Item
// ─────────────────────────────────────────────────────────────────────────────

export class CWNGearSheet extends CWNBaseItemSheet {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS,
    { classes: ['cwn-sheet', 'cwn-item-sheet', 'cwn-gear-sheet'], position: { width: 520, height: 560 } }
  );

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/item/gear.hbs` },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.consumableTypes = CONFIG.SWN?.itemConsumableTypes ?? {};
    context.ammoTypes       = CONFIG.SWN?.ammoTypes           ?? {};
    context.locations       = CONFIG.SWN?.itemLocations       ?? {};
    context.qualities       = CONFIG.SWN?.itemQualities       ?? {};
    context.conditions      = CONFIG.SWN?.gearCondition       ?? {};
    return context;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Skill
// ─────────────────────────────────────────────────────────────────────────────

export class CWNSkillSheet extends CWNBaseItemSheet {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS,
    { classes: ['cwn-sheet', 'cwn-item-sheet', 'cwn-skill-sheet'], position: { width: 480, height: 460 } }
  );

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/item/skill.hbs` },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.stats    = CONFIG.SWN?.stats ?? {};
    context.poolOpts = CONFIG.SWN?.pool  ?? {};
    return context;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Feature / Focus
// ─────────────────────────────────────────────────────────────────────────────

export class CWNFeatureSheet extends CWNBaseItemSheet {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS,
    { classes: ['cwn-sheet', 'cwn-item-sheet', 'cwn-feature-sheet'], position: { width: 540, height: 580 } }
  );

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/item/feature.hbs` },
  };

  static DEFAULT_OPTIONS_EXTRA = {
    actions: {
      ...CWNBaseItemSheet.DEFAULT_OPTIONS.actions,
      addPool:    CWNFeatureSheet._onAddPool,
      removePool: CWNFeatureSheet._onRemovePool,
    },
  };

  // Merge extra actions into DEFAULT_OPTIONS
  static get DEFAULT_OPTIONS() {
    return foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
      classes: ['cwn-sheet', 'cwn-item-sheet', 'cwn-feature-sheet'],
      position: { width: 540, height: 580 },
      actions: {
        addPool:    CWNFeatureSheet._onAddPool,
        removePool: CWNFeatureSheet._onRemovePool,
      },
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.featureTypes    = CONFIG.SWN?.featureTypes     ?? {};
    context.poolResources   = CONFIG.SWN?.poolResourceNames ?? {};
    context.poolCadences    = CONFIG.SWN?.poolCadences      ?? {};
    return context;
  }

  static async _onAddPool(event, target) {
    const pools = foundry.utils.deepClone(this.item.system.poolsGranted ?? []);
    pools.push({ resourceName: 'Effort', subResource: '', cadence: 'day', formula: '1', condition: '' });
    await this.item.update({ 'system.poolsGranted': pools });
  }

  static async _onRemovePool(event, target) {
    const idx   = parseInt(target.dataset.poolIndex);
    const pools = foundry.utils.deepClone(this.item.system.poolsGranted ?? []);
    pools.splice(idx, 1);
    await this.item.update({ 'system.poolsGranted': pools });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Cyberware
// ─────────────────────────────────────────────────────────────────────────────

export class CWNCyberwareSheet extends CWNBaseItemSheet {
  static get DEFAULT_OPTIONS() {
    return foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
      classes: ['cwn-sheet', 'cwn-item-sheet', 'cwn-cyberware-sheet'],
      position: { width: 520, height: 520 },
    });
  }

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/item/cyberware.hbs` },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.cyberTypes        = CONFIG.SWN?.cyberTypes          ?? {};
    context.concealmentTypes  = CONFIG.SWN?.cyberConcealmentTypes ?? {};
    return context;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Power
// ─────────────────────────────────────────────────────────────────────────────

export class CWNPowerSheet extends CWNBaseItemSheet {
  static get DEFAULT_OPTIONS() {
    return foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
      classes: ['cwn-sheet', 'cwn-item-sheet', 'cwn-power-sheet'],
      position: { width: 560, height: 640 },
      actions: {
        addConsumption:    CWNPowerSheet._onAddConsumption,
        removeConsumption: CWNPowerSheet._onRemoveConsumption,
      },
    });
  }

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/item/power.hbs` },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.powerSubTypes    = CONFIG.SWN?.powerSubTypes      ?? {};
    context.saveTypes        = CONFIG.SWN?.saveTypes          ?? {};
    context.consumptionTypes = CONFIG.SWN?.consumptionTypes   ?? {};
    context.consumptionTiming = CONFIG.SWN?.consumptionTiming ?? {};
    context.poolResources    = CONFIG.SWN?.poolResourceNames  ?? {};
    context.poolCadences     = CONFIG.SWN?.poolCadences       ?? {};

    // Index consumptions for template loops
    context.indexedConsumptions = (this.item.system.consumptions ?? []).map((c, i) => ({ ...c, _index: i }));
    return context;
  }

  static async _onAddConsumption(event, target) {
    const consumptions = foundry.utils.deepClone(this.item.system.consumptions ?? []);
    consumptions.push({ type: 'none', resourceName: null, subResource: null, usesCost: 1, cadence: 'day', itemText: '', uses: { value: 1, max: 1 }, timing: 'manual' });
    await this.item.update({ 'system.consumptions': consumptions });
  }

  static async _onRemoveConsumption(event, target) {
    const idx          = parseInt(target.dataset.consumptionIndex);
    const consumptions = foundry.utils.deepClone(this.item.system.consumptions ?? []);
    consumptions.splice(idx, 1);
    await this.item.update({ 'system.consumptions': consumptions });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Program (Cyberdeck program)
// ─────────────────────────────────────────────────────────────────────────────

export class CWNProgramSheet extends CWNBaseItemSheet {
  static get DEFAULT_OPTIONS() {
    return foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
      classes: ['cwn-sheet', 'cwn-item-sheet', 'cwn-program-sheet'],
      position: { width: 480, height: 480 },
    });
  }

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/item/program.hbs` },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.programTypes = CONFIG.SWN?.programTypes ?? {};
    return context;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Asset (Faction asset)
// ─────────────────────────────────────────────────────────────────────────────

export class CWNAssetSheet extends CWNBaseItemSheet {
  static get DEFAULT_OPTIONS() {
    return foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
      classes: ['cwn-sheet', 'cwn-item-sheet', 'cwn-asset-sheet'],
      position: { width: 560, height: 620 },
    });
  }

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/item/asset.hbs` },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.assetCategories = CONFIG.SWN?.assetCategories ?? {};
    return context;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Ship Weapon
// ─────────────────────────────────────────────────────────────────────────────

export class CWNShipWeaponSheet extends CWNBaseItemSheet {
  static get DEFAULT_OPTIONS() {
    return foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
      classes: ['cwn-sheet', 'cwn-item-sheet', 'cwn-ship-weapon-sheet'],
      position: { width: 540, height: 580 },
    });
  }

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/item/ship-weapon.hbs` },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.ammoTypes      = CONFIG.SWN?.ammoTypes       ?? {};
    context.vehicleClasses = CONFIG.SWN?.allVehicleClasses ?? {};
    context.vehicleTypes   = CONFIG.SWN?.vehicleTypes     ?? {};
    context.stats          = CONFIG.SWN?.stats            ?? {};
    return context;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Ship Fitting
// ─────────────────────────────────────────────────────────────────────────────

export class CWNShipFittingSheet extends CWNBaseItemSheet {
  static get DEFAULT_OPTIONS() {
    return foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
      classes: ['cwn-sheet', 'cwn-item-sheet', 'cwn-ship-fitting-sheet'],
      position: { width: 500, height: 520 },
    });
  }

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/item/ship-fitting.hbs` },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.vehicleClasses = CONFIG.SWN?.allVehicleClasses ?? {};
    context.vehicleTypes   = CONFIG.SWN?.vehicleTypes      ?? {};
    return context;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Ship Defense
// ─────────────────────────────────────────────────────────────────────────────

export class CWNShipDefenseSheet extends CWNBaseItemSheet {
  static get DEFAULT_OPTIONS() {
    return foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
      classes: ['cwn-sheet', 'cwn-item-sheet', 'cwn-ship-defense-sheet'],
      position: { width: 500, height: 500 },
    });
  }

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/item/ship-defense.hbs` },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.vehicleClasses = CONFIG.SWN?.allVehicleClasses ?? {};
    context.vehicleTypes   = CONFIG.SWN?.vehicleTypes      ?? {};
    return context;
  }
}
