
// index.js
const APP_ID = '3458764654677680434';             // Your app/client ID
const COLLECTION = 'synced-shapes';       // Board-scoped collection

const uuid = () => crypto.randomUUID();

// Entry point via toolbar icon
miro.board.ui.on('icon:click', async () => {
  await miro.board.ui.openPanel({ url: 'index.html' });
}); // Use 'icon:click' to open a panel from the toolbar. [7](https://developers.miro.com/docs/add-icon-click-to-your-app)

async function initPanel() {
  const tpl = document.getElementById('panel').content.cloneNode(true);
  document.body.appendChild(tpl);

  document.querySelector('#mark-master').addEventListener('click', markSelectedAsMaster);
  document.querySelector('#duplicate-link').addEventListener('click', duplicateAndLink);
  document.querySelector('#sync').addEventListener('click', syncFromMaster);
}
document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', initPanel)
  : initPanel();

// === Core actions ===

async function markSelectedAsMaster() {
  const status = document.getElementById('status');
  const selected = await miro.board.getSelection();
  if (!selected || selected.length !== 1 || selected[0].type !== 'shape') {
    status.textContent = 'Select exactly one shape to mark as master.';
    return;
  }
  const master = selected[0];
  const groupId = uuid();

  // Persist item metadata under your app namespace (if available)
  if (typeof master.setMetadata === 'function') {
    await master.setMetadata(APP_ID, { groupId, role: 'master' });
    await master.sync();
  }
  // Track group in the per-board storage collection
  const col = miro.board.storage.collection(COLLECTION);
  await col.set(groupId, { masterId: master.id, childIds: [] }); // Per-board app storage. [2](https://developers.miro.com/docs/storage)

  // Visual cue for master (border highlight)
  master.style.borderColor = '#ff9900';
  master.style.borderWidth = 4;
  await master.sync(); // Updates require sync() to apply on the board. [1](https://developers.miro.com/docs/update-and-sync-item-properties)

  status.textContent = `Master set (groupId=${groupId}).`;
}

async function duplicateAndLink() {
  const status = document.getElementById('status');
  const selected = await miro.board.getSelection();
  if (!selected || selected.length !== 1 || selected[0].type !== 'shape') {
    status.textContent = 'Select the master shape first.';
    return;
  }
  const master = selected[0];

  // Resolve groupId from master metadata
  let groupId;
  if (typeof master.getMetadata === 'function') {
    const md = await master.getMetadata(APP_ID);
    groupId = md?.groupId;
  }
  if (!groupId) {
    status.textContent = 'No groupId found on selected shape (did you mark it as master?).';
    return;
  }

  // Create a linked duplicate (copy properties but offset position)
  const clone = await miro.board.createShape({
    content: master.content,
    shape: master.shape,
    style: { ...master.style },
    x: master.x + 180,
    y: master.y,
    width: master.width,
    height: master.height,
    rotation: master.rotation,
  }); // Creating & updating shapes is supported via the Web SDK. [8](https://developers.miro.com/docs/websdk-reference-shape)

  // Mark child metadata and store ID in the group record
  if (typeof clone.setMetadata === 'function') {
    await clone.setMetadata(APP_ID, { groupId, role: 'child' });
    await clone.sync();
  }
  const col = miro.board.storage.collection(COLLECTION);
  const rec = (await col.get(groupId)) || { masterId: master.id, childIds: [] };
  rec.childIds.push(clone.id);
  await col.set(groupId, rec);

  status.textContent = `Linked duplicate added (groupId=${groupId}).`;
}

async function syncFromMaster() {
  const status = document.getElementById('status');
  const selected = await miro.board.getSelection();
  if (!selected || selected.length !== 1 || selected[0].type !== 'shape') {
    status.textContent = 'Select the master shape to sync.';
    return;
  }
  const master = selected[0];

  // Read property toggles from panel
  const syncColor = document.querySelector('#sync-color')?.checked ?? true;
  const syncFont  = document.querySelector('#sync-font')?.checked ?? true;

  // Resolve groupId & record
  let groupId;
  if (typeof master.getMetadata === 'function') {
    const md = await master.getMetadata(APP_ID);
    groupId = md?.groupId;
  }
  if (!groupId) {
    status.textContent = 'No groupId found on selected shape.';
    return;
  }

  const col = miro.board.storage.collection(COLLECTION);
  const rec = await col.get(groupId);
  if (!rec?.childIds?.length) {
    status.textContent = 'No linked duplicates found to sync.';
    return;
  }

  // Prepare master properties we’ll propagate
  const m = master; // alias

  for (const childId of rec.childIds) {
    const child = await miro.board.getById(childId);
    if (!child) continue;

    // Always sync text content
    child.content = m.content;

    // Sync shape type (optional; useful if you transform master)
    child.shape = m.shape;

    // Sync color (fill + text color)
    if (syncColor) {
      child.style = child.style || {};
      child.style.fillColor = m.style?.fillColor;
      child.style.color     = m.style?.color; // text color
    }

    // Sync font (family + size)
    if (syncFont) {
      child.style = child.style || {};
      child.style.fontFamily = m.style?.fontFamily;
      child.style.fontSize   = m.style?.fontSize;
      // You can also include fontWeight, textAlign, etc., if desired
    }

    // Dimensions/rotation optional—skip position on purpose
    child.width    = m.width;
    child.height   = m.height;
    child.rotation = m.rotation;

    await child.sync(); // Persist changes to the board. [1](https://developers.miro.com/docs/update-and-sync-item-properties)
  }

  status.textContent = `Synced ${rec.childIds.length} duplicates from master.`;
}
``
