
// ---- helpers ----
const META_KEY = 'syncedShapes';

// A small helper to show status messages in the panel.
function log(message) {
  const el = document.getElementById('log');
  el.textContent = message;
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

// ---- core features ----

// Set the selected shape as master by attaching a masterId in item metadata.
async function setSelectedAsMaster() {
  const shape = await getSelectedShape();
  if (!shape) return;

  const masterId = generateMasterId();

  await shape.setMetadata(META_KEY, { masterId, isMaster: true });
  await shape.sync(); // v2: persist the metadata change

  log(`Master set. masterId = ${masterId}`);
}

// Create a synced copy of the selected master shape.
async function createSyncedCopy() {
  const shape = await getSelectedShape();
  if (!shape) return;

  const meta = await shape.getMetadata();
  const appData = meta && meta[META_KEY];
  if (!appData || !appData.isMaster || !appData.masterId) {
    log('The selected shape is not a master. Set it as master first.');
    return;
  }

  const masterId = appData.masterId;

  // Duplicate the shape, offset a bit so it’s visible.
  const copy = await miro.board.createShape({
    content: shape.content,
    shape: shape.shape,           // same geometric type
    x: (shape.x ?? 0) + 250,
    y: shape.y ?? 0,
    width: shape.width,
    height: shape.height,
    // style is an object: we can copy and then assign
    style: { ...shape.style },
  });

  await copy.setMetadata(META_KEY, { masterId, isMaster: false });
  await copy.sync();

  log(`Synced copy created for masterId = ${masterId} (copy id: ${copy.id})`);
}

// Find the master shape for the currently selected master or any of its copies.
async function findMasterFromSelection() {
  const shape = await getSelectedShape();
  if (!shape) return null;

  const meta = await shape.getMetadata();
  const appData = meta && meta[META_KEY];
  if (!appData || !appData.masterId) {
    log('Selected shape is not part of a synced group.');
    return null;
  }

  const masterId = appData.masterId;
  if (appData.isMaster) return shape;

  // Otherwise, search the board for the master shape with the same masterId.
  const allItems = await miro.board.get({ type: 'shape' });
  const shapes = filterShapes(allItems);

  // Fetch metadata in parallel for performance
  const entries = await Promise.all(
    shapes.map(async (item) => {
      const m = await item.getMetadata();
      return { item, data: m && m[META_KEY] };
    })
  );

  const found = entries.find((e) => e.data && e.data.isMaster && e.data.masterId === masterId);
  if (!found) {
    log(`No master found for masterId = ${masterId}.`);
    return null;
  }
  return found.item;
}

// Sync all copies from the current master (selected shape or its group).
async function syncCopiesFromMaster() {
  const master = await findMasterFromSelection();
  if (!master) return;

  const masterMeta = await master.getMetadata();
  const { masterId } = masterMeta[META_KEY];

  // Gather all shapes on the board with this masterId (excluding the master)
  const allItems = await miro.board.get({ type: 'shape' });
  const shapes = filterShapes(allItems);

  const entries = await Promise.all(
    shapes.map(async (item) => {
      const m = await item.getMetadata();
      return { item, data: m && m[META_KEY] };
    })
  );

  const copies = entries
    .filter((e) => e.data && e.data.masterId === masterId && !e.data.isMaster)
    .map((e) => e.item);

  if (copies.length === 0) {
    log(`No copies found for masterId = ${masterId}.`);
    return;
  }

  // Prepare the data from master to propagate.
  const newContent = master.content;
  const newWidth = master.width;
  const newHeight = master.height;
  const newStyle = { ...master.style };

  // Update all copies and sync them (v2 requirement)
  await Promise.all(
    copies.map(async (copy) => {
      copy.content = newContent;
      Object.assign(copy.style, newStyle);  // copy style fields
      copy.width = newWidth;
      copy.height = newHeight;
      await copy.sync();
    })
  );

  log(`Synced ${copies.length} copies from masterId = ${masterId}.`);
}

// ---- bootstrapping ----
miro.onReady(async () => {
  // Ensures SDK is ready/authorized before wiring up handlers
  await miro.board.getInfo();

  document.getElementById('set-master').addEventListener('click', setSelectedAsMaster);
  document.getElementById('create-copy').addEventListener('click', createSyncedCopy);
  document.getElementById('sync-copies').addEventListener('click', syncCopiesFromMaster);

  log('Synced Shapes app ready. Select a shape to begin.');
});
