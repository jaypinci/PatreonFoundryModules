/**
 * Serialize actor ActiveEffects for Handlebars templates (Foundry v12+ uses `img`, not `icon`).
 */
export function prepareEffectsForRender(actor) {
  const temporary = [];
  const passive   = [];
  const inactive  = [];

  for (const effect of actor.allApplicableEffects?.() ?? actor.effects) {
    const row = {
      id:         effect.id,
      name:       effect.name,
      img:        effect.img ?? 'icons/svg/aura.svg',
      disabled:   effect.disabled,
      sourceName: effect.sourceName ?? '',
    };
    if (effect.disabled) {
      inactive.push(row);
    } else if (effect.isTemporary ?? effect.duration?.type !== 'none') {
      temporary.push(row);
    } else {
      passive.push(row);
    }
  }

  return { temporary, passive, inactive };
}
