
const APP_ID = '3458764654677680434'; // Your Client ID from Miro

const COLLECTION = 'synced-shapes';
const uuid = () => crypto.randomUUID();

miro.board.ui.on('icon:click', async () => {
  await miro.board.ui.openPanel({ url: 'index.html' });
});

function byId(id) { return document.getElementById(id); }

async function initPanel() {
  const tpl = document.getElementById('panel').content.cloneNode(true);
  document.body.appendChild(tpl);

  byId('mark-master').addEventListener('click', markSelectedAsMaster);
  byId('duplicate-link').addEventListener('click', duplicateAndLink);
  byId('sync').addEventListener('click', syncFromMaster);
}
document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', initPanel)
  : initPanel();

async function markSelectedAsMaster() {
  const status = byId('status');
  const selected = await miro.board.getSelection();
  if (!selected || selected.length !== 1 || selected[0].type !== 'shape') {
    status.textContent = 'Select exactly one shape to mark as master.';
    return;
  }
  const master = selected[0];
  const groupId = uuid();

  if (typeof master.setMetadata === 'function') {
    await master.setMetadata(APP_ID, { groupId, role: 'master' });
    await master.sync();
  }

  const col = miro.board.storage.collection(COLLECTION);
  await col.set(groupId, { masterId: master.id, childIds: [] });

  master.style.borderColor = '#ff9900';
  master.style.borderWidth = 4;
  await master.sync();

  status.textContent = `Master set (groupId=${groupId}).`;
}

async function duplicateAndLink() {
  const status = byId('status');
  const selected = await miro.board.getSelection();
  if (!selected || selected.length !== 1 || selected[0].type !== 'shape') {
    status.textContent = 'Select the master shape first.';
    return;
  }
  const master = selected[0];

  let groupId;
  if (typeof master.getMetadata === 'function') {
    const md = await master.getMetadata(APP_ID);
    groupId = md?.groupId;
  }
  if (!groupId) {
    status.textContent = 'No groupId found on selected shape.';
    return;
  }

  const clone = await miro.board.createShape({
    content: master.content,
    shape: master.shape,
    style: { ...master.style },
    x: master.x + 180,
    y: master.y,
    width: master.width,
    height: master.height,
    rotation: master.rotation,
  });

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
  const status = byId('status');
  const selected = await miro.board.getSelection();
  if (!selected || selected.length !== 1 || selected[0].type !== 'shape') {
    status.textContent = 'Select the master shape to sync.';
    return;
  }
  const master = selected[0];

  const syncColor = byId('sync-color')?.checked ?? true;
  const syncFont  = byId('sync-font')?.checked ?? true;

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
    status.textContent = 'No linked duplicates found.';
    return;
  }

  const m = master;
  let updated = 0;

  for (const childId of rec.childIds) {
    const child = await miro.board.getById(childId);
    if (!child) continue;

    child.content = m.content;

    if (syncColor) {
      child.style.fillColor = m.style?.fillColor;
      child.style.color     = m.style?.color;
    }

    if (syncFont) {
      child.style.fontFamily = m.style?.fontFamily;
      child.style.fontSize   = m.style?.fontSize;
    }

    child.shape    = m.shape;
    child.width    = m.width;
    child.height   = m.height;
    child.rotation = m.rotation;

    await child.sync();
    updated++;
  }

  status.textContent = `Synced ${updated} duplicates from master.`;
}
