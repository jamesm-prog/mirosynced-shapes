
// -------------------------------
// Synced Shapes - Headless script
// -------------------------------

function log(message) {
  const el = document.getElementById('log');
  if (el) el.textContent = message;
  console.log('[Synced Shapes]', message);
}

function generateMasterId() {
  return 'master-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
}

function filterShapes(items) {
  return items.filter((item) => item.type === 'shape');
}

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

async function setSelectedAsMaster() {
  const shape = await getSelectedShape();
  if (!shape) return;

  const masterId = generateMasterId();

  await shape.update({
    appData: {
      syncedShapes: { masterId, isMaster: true },
    },
  });

  log(`Master set. masterId = ${masterId}`);
}

async function createSyncedCopy() {
  const shape = await getSelectedShape();
  if (!shape) return;

  const appData = shape.appData && shape.appData.syncedShapes;
  if (!appData || !appData.isMaster || !appData.masterId) {
    log('The selected shape is not a master. Set it as master first.');
    return;
  }

  const masterId = appData.masterId;

  const copy = await miro.board.createShape({
    content: shape.content,
    shape: shape.shape,
    x: (shape.x ?? 0) + 250,
    y: shape.y ?? 0,
    width: shape.width,
    height: shape.height,
    style: { ...shape.style },
    appData: {
      syncedShapes: { masterId, isMaster: false },
    },
  });

  log(`Synced copy created for masterId = ${masterId} (copy id: ${copy.id})`);
}

async function findMasterFromSelection() {
  const shape = await getSelectedShape();
  if (!shape) return null;

  const appData = shape.appData && shape.appData.syncedShapes;
  if (!appData || !appData.masterId) {
    log('Selected shape is not part of a synced group.');
    return null;
  }

  const masterId = appData.masterId;

  if (appData.isMaster) return shape;

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

async function syncCopiesFromMaster() {
  const master = await findMasterFromSelection();
  if (!master) return;

  const appData = master.appData && master.appData.syncedShapes;
  const masterId = appData.masterId;

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

  const newContent = master.content;
  const newStyle = { ...master.style };
  const newWidth = master.width;
  const newHeight = master.height;

  await Promise.all(
    copies.map((copy) =>
      copy.update({
        content: newContent,
        style: newStyle,
        width: newWidth,
        height: newHeight,
      }),
    ),
  );

  log(`Synced ${copies.length} copies from masterId = ${masterId}.`);
}

// Expose functions for the panel
window.syncedShapes = {
  setSelectedAsMaster,
  createSyncedCopy,
  syncCopiesFromMaster,
};

miro.onReady(async () => {
  console.log('Miro SDK ready: Synced Shapes');

  // Open panel from toolbar icon click
  miro.board.ui.on('icon:click', async () => {
    try {
      if (await miro.board.ui.canOpenPanel()) {
        const { waitForClose } = await miro.board.ui.openPanel({ url: 'panel.html' });
        await waitForClose(); // optional
      } else {
        console.warn('Panel cannot open right now (blocked by other UI).');
      }
    } catch (err) {
      console.error('Failed to open panel:', err);
    }
  });

  // If index.html contains buttons, wire them too (safe if not present)
  document.getElementById('set-master')?.addEventListener('click', setSelectedAsMaster);
  document.getElementById('create-copy')?.addEventListener('click', createSyncedCopy);
  document.getElementById('sync-copies')?.addEventListener('click', syncCopiesFromMaster);

  log('Synced Shapes app ready. Select a shape to begin.');
});
``
