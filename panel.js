
// panel.js
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Make sure we're running inside Miro; this ensures auth too
    await miro.board.getInfo();

    const logEl = document.getElementById('log');
    const log = (m) => { logEl.textContent += m + '\n'; };

    document.getElementById('set-master').addEventListener('click', async () => {
      const selection = await miro.board.getSelection();
      if (!selection.length) {
        log('No item selected');
        return;
      }
      // TODO: save "master" metadata on the selected shape
      log(`Master set: ${selection[0].id}`);
    });

    document.getElementById('create-copy').addEventListener('click', async () => {
      const selection = await miro.board.getSelection();
      if (!selection.length) {
        log('No item selected to copy');
        return;
      }
      const src = selection[0];
      // Example: duplicate shape with same geometry/text (simplified)
      if (src.type === 'shape') {
        const copy = await miro.board.createShape({
          content: src.content || '',
          shape: src.shape || 'rectangle',
          style: src.style || {},
          x: (src.x || 0) + 50,
          y: (src.y || 0) + 50
        });
        // TODO: link copy to master via metadata
        log(`Copy created: ${copy.id}`);
      } else {
        log(`Selected item type ${src.type} not yet handled`);
      }
    });

    document.getElementById('sync-copies').addEventListener('click', async () => {
      // TODO: read master, find linked copies via metadata, update each copy
      log('Sync triggered (implement your metadata/propagation logic here)');
    });
  } catch (e) {
    console.error(e);
    alert('Miro SDK not ready or app not authorized.');
  }
});
