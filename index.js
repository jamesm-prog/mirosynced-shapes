// index.js
const APP_ID = '3458764654677680434'; // your app/client ID namespace for metadata
const COLLECTION = 'synced-shapes'; // board-scoped collection name

// Small helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();

async function openPanel() {
  const tpl = document.getElementById('panel').content.cloneNode(true);
  const panel = document.createElement('div');
  panel.appendChild(tpl);
  document.body.appendChild(panel);

  // Wire up buttons
  panel.querySelector('#mark-master').addEventListener('click', markSelectedAsMaster);
  panel.querySelector('#duplicate-link').addEventListener('click', duplicateAndLink);
  panel.querySelector('#sync').addEventListener('click', syncFromMaster);

  // Optional: start/stop polling
  const polling = panel.querySelector('#polling');
  polling.addEventListener('change', (e) => togglePolling(e.target.checked));
}

// Called when user clicks your toolbar icon
miro.board.ui.on('icon:click', async () => {
  await miro.board.ui.openPanel({ url: 'index.html' });
}); // The icon:click event is supported on Web SDK v2. [4](https://developers.miro.com/docs/add-icon-click-to-your-app)

async function markSelectedAsMaster() {
  const status = document.getElementById('status');
  const selected = await miro.board.getSelection();
  if (!selected || selected.length !== 1 || selected[0].type !== 'shape') {
    status.textContent = 'Select exactly one shape.';
    return;
  }
  const master = selected[0];
  const groupId = uuid();

  // Persist item-level metadata for the master
  // NB: Web SDK item metadata is stored under your app namespace.
  // Example approach: item.setMetadata(APP_ID, data). See note/caveat below.
  if (typeof master.setMetadata === 'function') {
    await master.setMetadata(APP_ID, { groupId, role: 'master' });
    await master.sync();
  } else {
    // Fallback: store mapping only in collection (works but won't persist on board copy)
    // Better: upgrade once your environment exposes setMetadata for items.
  }

  // Store group record in the board collection
  const col = miro.board.storage.collection(COLLECTION);
  await col.set(groupId, { masterId: master.id, childIds: [] });

  // Visual feedback: change border/fill to denote "master"
  master.style.borderColor = '#ff9900';
  master.style.borderWidth = 4;
  await master.sync(); // updates must be followed by sync() to apply on the board. [1](https://developers.miro.com/docs/update-and-sync-item-properties)

  status.textContent = `Marked master. groupId=${groupId}`;
}

async function duplicateAndLink() {
  const status = document.getElementById('status');
  const selected = await miro.board.getSelection();
  if (!selected || selected.length !== 1 || selected[0].type !== 'shape') {
    status.textContent = 'Select the master shape first.';
    return;
  }
  const master = selected[0];

  // Retrieve master groupId from metadata or collection
  let groupId;
  if (typeof master.getMetadata === 'function') {
    const md = await master.getMetadata(APP_ID);
    groupId = md?.groupId;
  }
  if (!groupId) {
    // Try collection: brute-force find the group by masterId
    const col = miro.board.storage.collection(COLLECTION);
    // You might keep a "index" key for quick lookup; here we scan keys for brevity
    // (left as exercise to store a reverse index)
    status.textContent = 'No groupId found. Did you mark this as master?';
    return;
  }

  // Create a linked duplicate
  const clone = await miro.board.createShape({
    content: master.content,
    shape: master.shape,
    style: { ...master.style },
    x: master.x + 200, // offset so users can see the new item
    y: master.y,
    width: master.width,
    height: master.height,
    rotation: master.rotation,
  }); // Creating shapes via Web SDK is supported. [13](https://developers.miro.com/docs/websdk-reference-shape)

  // Set child metadata & add to collection
  if (typeof clone.setMetadata === 'function') {
    await clone.setMetadata(APP_ID, { groupId, role: 'child' });
    await clone.sync();
  }
  const col = miro.board.storage.collection(COLLECTION);
  const rec = (await col.get(groupId)) || { masterId: master.id, childIds: [] };
  rec.childIds.push(clone.id);
  await col.set(groupId, rec);

  status.textContent = `Linked duplicate added to groupId=${groupId}`;
}

async function syncFromMaster() {
  const status = document.getElementById('status');

  // Strategy: find all shapes on the board and filter by our metadata group,
  // OR read child list from the collection.
  const col = miro.board.storage.collection(COLLECTION);
  // In a real app: present a group picker. For brevity, we sync the group of the selected master.
  const selected = await miro.board.getSelection();
  if (!selected || selected.length !== 1 || selected[0].type !== 'shape') {
    status.textContent = 'Select the master to sync.';
    return;
  }
  const master = selected[0];

  // Obtain groupId & record
  let groupId;
  if (typeof master.getMetadata === 'function') {
    const md = await master.getMetadata(APP_ID);
    groupId = md?.groupId;
  }
  if (!groupId) {
    status.textContent = 'No groupId found on selected shape.';
    return;
  }
  const rec = await col.get(groupId);
  if (!rec || !rec.childIds?.length) {
    status.textContent = 'No linked duplicates found.';
    return;
  }

  // Propagate properties (excluding position)
  for (const childId of rec.childIds) {
    const child = await miro.board.getById(childId);
    if (!child) continue;

    child.content = master.content;
    child.shape = master.shape;
    child.style = { ...master.style };
    child.width = master.width;
    child.height = master.height;
    child.rotation = master.rotation;

    await child.sync(); // Changes only take effect after sync() [1](https://developers.miro.com/docs/update-and-sync-item-properties)
    // UI nicety
    await sleep(20);
  }
  status.textContent = `Synced ${rec.childIds.length} duplicates from master.`;
}

// Optional: low-frequency polling for master changes
let pollingHandle = null;
async function togglePolling(on) {
  const status = document.getElementById('status');
  if (on) {
    status.textContent = 'Polling master changes…';
    // Every 3s: check selected master .modifiedAt and propagate if changed
    let lastModified = null;
    pollingHandle = setInterval(async () => {
      const sel = await miro.board.getSelection();
      if (!sel?.length) return;
      const master = sel[0];
      if (master?.modifiedAt && master.modifiedAt !== lastModified) {
        lastModified = master.modifiedAt;
        await syncFromMaster();
      }
    }, 3000);
  } else {
    clearInterval(pollingHandle);
    pollingHandle = null;
    status.textContent = 'Polling stopped.';
  }
}

