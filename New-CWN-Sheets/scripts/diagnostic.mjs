/**
 * Sheet Registration Diagnostic
 * Run this macro in Foundry to check what actor sheets are registered
 */

export function checkSheetRegistration() {
  console.log("=== SHEET REGISTRATION DIAGNOSTIC ===");
  
  // Check if Actors collection exists
  if (!foundry.documents.collections.Actors) {
    console.error("Actors collection not found!");
    return;
  }
  
  // Get registered sheets
  const registered = foundry.documents.collections.Actors.registeredSheets;
  console.log(`Total registered sheets: ${registered.length}`);
  
  // List ALL sheets raw
  console.log("\nAll registered sheets (raw):");
  registered.forEach((s, i) => {
    console.log(`  ${i}: namespace=${s.namespace}, label=${s.label}, types=[${s.types?.join(', ')}]`);
  });
  
  // Group by type
  const byType = {};
  registered.forEach(sheet => {
    const types = sheet.types || [];
    types.forEach(type => {
      if (!byType[type]) byType[type] = [];
      byType[type].push({
        name: sheet.name,
        label: sheet.label,
        namespace: sheet.namespace,
        cls: sheet.cls?.name || 'unknown'
      });
    });
  });
  
  console.log("\nSheets by actor type:");
  Object.entries(byType).forEach(([type, sheets]) => {
    console.log(`\n  ${type}:`);
    sheets.forEach(s => {
      console.log(`    - ${s.label} (${s.namespace}) [${s.cls}]`);
    });
  });
  
  // Check for specific sheets
  console.log("\n\nLooking for SWN base sheets...");
  const swnrSheets = registered.filter(s => s.namespace === 'swnr');
  console.log(`  Found ${swnrSheets.length} sheets with 'swnr' namespace`);
  swnrSheets.forEach(s => {
    console.log(`    - ${s.label}: types=[${s.types?.join(', ')}]`);
  });
  
  // Check all namespaces
  const namespaces = [...new Set(registered.map(s => s.namespace))];
  console.log(`\n\nAll namespaces: ${namespaces.join(', ') || '(none)'}`);
  
  // Check system status
  console.log("\n\nSystem status:");
  console.log(`  Current system: ${game.system?.id || 'none'}`);
  console.log(`  System version: ${game.system?.version || 'unknown'}`);
  console.log(`  Foundry version: ${game.version}`);
  
  // Check CONFIG.Actor
  console.log("\n\nCONFIG.Actor check:");
  console.log(`  CONFIG.Actor.sheetClass: ${CONFIG.Actor?.sheetClass?.name || 'not set'}`);
  console.log(`  CONFIG.Actor.dataModels: ${Object.keys(CONFIG.Actor?.dataModels || {}).join(', ') || 'none'}`);
  
  // Check Actor types
  console.log("\n\nActor document types:");
  const actorTypes = Object.keys(CONFIG.Actor?.dataModels || {});
  console.log(`  Types: ${actorTypes.join(', ') || 'none found'}`);
  
  // Check for any hook errors
  console.log("\n\nChecking hook events...");
  const initHooks = Hooks.events?.init || [];
  console.log(`  'init' hook handlers: ${initHooks.length}`);
  
  console.log("\n=== END DIAGNOSTIC ===");
  
  // Return data for UI display
  return {
    total: registered.length,
    byType,
    namespaces,
    swnrCount: swnrSheets.length,
    system: game.system?.id,
    actorTypes
  };
}

// Auto-run if loaded
Hooks.once('ready', () => {
  setTimeout(() => checkSheetRegistration(), 1000);
});
