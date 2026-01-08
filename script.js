// A small helper to show status messages in the panel.
function log(message) {
  const el = document.getElementById('log');
  el.textContent = message;
  console.log('[Synced Shapes]', message);
}

async function init() {
  await miro.board.ui.on('icon:click', async () => {
    // e.g., open a panel or perform an action
    await miro.board.ui.openPanel({url: 'panel.html'});
  });
}
init();

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

  // appData is app-specific metadata; we store our masterId there.
  await shape.update({
    appData: {
      // Use your own namespace key to avoid conflicts
      syncedShapes: {
        masterId,
        isMaster: true
      }
    }
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
    x: shape.x + 250,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    style: { ...shape.style },
    appData: {
      syncedShapes: {
        masterId,
        isMaster: false
      }
    }
  });

  log(`Synced copy created for masterId = ${masterId} (copy id: ${copy.id})`);
}

// Find the master shape for the currently selected master or any of its copies.
async function findMasterFromSelection() {
  const shape = await getSelectedShape();
  if (!shape) return null;

  const appData = shape.appData && shape.appData.syncedShapes;
  if (!appData || !appData.masterId) {
    log('Selected shape is not part of a synced group.');
    return null;
  }

  const masterId = appData.masterId;

  // If the selected shape itself is marked as master, just return it.
  if (appData.isMaster) {
    return shape;
  }

  // Otherwise, search the board for the master shape with the same masterId.
  const allItems = await miro.board.get({ type: 'shape' });
  const shapes = filterShapes(allItems);

  const master = shapes.find((item) => {
    const data = item.appData && item.appData.syncedShapes;
    return data && data.isMaster && data.masterId === masterId;
  });

  if (!master) {
    log(`No master found for masterId = ${masterId}.`);
    return null;
  }

  return master;
}

// Sync all copies from the current master (selected shape or its group).
async function syncCopiesFromMaster() {
  const master = await findMasterFromSelection();
  if (!master) return;

  const appData = master.appData && master.appData.syncedShapes;
  const masterId = appData.masterId;

  // Get all shapes on the board that share this masterId.
  const allItems = await miro.board.get({ type: 'shape' });
  const shapes = filterShapes(allItems);

  const copies = shapes.filter((item) => {
    const data = item.appData && item.appData.syncedShapes;
    return data && data.masterId === masterId && !data.isMaster;
  });

  if (copies.length === 0) {
    log(`No copies found for masterId = ${masterId}.`);
    return;
  }

  // Prepare the data from master to propagate.
  const newContent = master.content;
  const newStyle = { ...master.style };
  const newWidth = master.width;
  const newHeight = master.height;

  // Update all copies.
  await Promise.all(
    copies.map((copy) =>
      copy.update({
        content: newContent,
        style: newStyle,
        width: newWidth,
        height: newHeight
      })
    )
  );

  log(`Synced ${copies.length} copies from masterId = ${masterId}.`);
}

// Hook up UI events when the Web SDK is ready.
miro.onReady(() => {
  document.getElementById('set-master').addEventListener('click', setSelectedAsMaster);
  document.getElementById('create-copy').addEventListener('click', createSyncedCopy);
  document.getElementById('sync-copies').addEventListener('click', syncCopiesFromMaster);

  log('Synced Shapes app ready. Select a shape to begin.');
});

