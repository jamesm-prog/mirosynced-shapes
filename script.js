
// -------------------------------
// Synced Shapes - Headless script
// -------------------------------

// Utility logger: safe even if #log isn't present (e.g., in headless mode).
function log(message) {
  const el = document.getElementById('log');
  if (el) el.textContent = message;
  console.log('[Synced Shapes]', message);
}

// Generate a simple unique id for a master group.
function generateMasterId() {
  return 'master-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
}

// Ensure we only work with shapes.
function filterShapes(items) {
  return items.filter((item) => item.type === 'shape');
}

// Get the currently selected shape, or null.
async function getSelectedShape() {
  const selection = await miro.board.getSelection();
  const shapes = filterShapes(selection);

  if (shapes.length === 0) {
    log('Select a shape first.');
    return null;
  }
  if (shapes.length > 1) {
    log('Select exactly one shape.');
    return null;
  }

  return shapes[0];
}

// Set the selected shape as master by attaching a masterId in appData.
async function setSelectedAsMaster() {
  const shape = await getSelectedShape();
  if (!shape) return;

  const masterId = generateMasterId();

  await shape.update({
    appData: {
      // Use a unique namespace to avoid conflicts with other apps
      syncedShapes: {
        masterId,
        isMaster: true,
      },
    },
  });

  log(`Master set. masterId = ${masterId}`);
}

// Create a synced copy of the selected master shape.
async function createSyncedCopy() {
  const shape = await getSelectedShape();
  if (!shape) return;

  const appData = shape.appData && shape.appData.syncedShapes;
  if (!appData || !appData.isMaster || !appData.masterId) {
    log('The selected shape is not a master. Set it as master first.');
    return;
  }

  const masterId = appData.masterId;

  // Duplicate the shape, offset a bit so it’s visible.
  const copy = await miro.board.createShape({
    content: shape.content,
    shape: shape.shape, // same geometric type
    x: (shape.x ?? 0) + 250,
    y: shape.y ?? 0,
    width: shape.width,
    height: shape.height,
    style: { ...shape.style },
