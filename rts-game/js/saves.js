// =============================================================================
// saves.js — WHERE SAVED GAMES ARE KEPT
//
// A save is the text from saveGame() (sim.js), gzip-compressed (about 40 KB).
// Four slots: an autosave and three of the player's own.
//
// When the game runs as a published page on claude.ai, saves go to the
// page's private per-person store (the `db` capability, under
// data/users/<you>/): they survive cleared browser data and follow you to
// other devices. Anywhere else (a file on your computer, the repository)
// they go to this browser's local storage. Saves can also be downloaded as a
// file and loaded back from one, on any device.
// =============================================================================

const Saves = (() => {
  const SLOTS = [['auto', 'Autosave'], ['1', 'Slot 1'], ['2', 'Slot 2'], ['3', 'Slot 3']];
  let cloud = null, downloads = null;
  // The published page's capabilities arrive a moment after load (or never).
  const ready = (async () => {
    try {
      if (!window.claude || !window.claude.use) return;
      const [db, user, dl] = await Promise.all([claude.use('db'), claude.use('user'), claude.use('downloads')]);
      downloads = dl;
      const uid = user && await user.id();
      if (db && uid) cloud = db.collection('data/users/' + uid);
    } catch (err) { cloud = null; }
  })();

  async function pack(text) {
    if (typeof CompressionStream === 'undefined') return { z: 'raw', data: text };
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return { z: 'gz', data: bytesToB64(new Uint8Array(await new Response(stream).arrayBuffer())) };
  }
  async function unpack(rec) {
    if (rec.z !== 'gz') return rec.data;
    const stream = new Blob([b64ToBytes(rec.data)]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  const localKey = slot => 'scrapline.save.' + slot;

  // { slot: meta } for every slot that holds a save.
  async function list() {
    await ready;
    const out = {};
    if (cloud) {
      const snap = await cloud.get();
      for (const d of snap.docs) if (d.id.startsWith('save-')) out[d.id.slice(5)] = d.data().meta;
    } else {
      for (const [slot] of SLOTS) {
        try { const r = JSON.parse(localStorage.getItem(localKey(slot)) || 'null'); if (r) out[slot] = r.meta; } catch (err) { /* unreadable: treat as empty */ }
      }
    }
    return out;
  }
  async function put(slot, text, meta) {
    await ready;
    const rec = { meta, ...(await pack(text)) };
    if (cloud) await cloud.doc('save-' + slot).set(rec);
    else localStorage.setItem(localKey(slot), JSON.stringify(rec));
  }
  async function get(slot) {
    await ready;
    let rec = null;
    if (cloud) { const d = await cloud.doc('save-' + slot).get(); rec = d.exists ? d.data() : null; }
    else rec = JSON.parse(localStorage.getItem(localKey(slot)) || 'null');
    if (!rec) throw new Error('That slot is empty');
    return unpack(rec);
  }
  async function del(slot) {
    await ready;
    if (cloud) await cloud.doc('save-' + slot).delete();
    else localStorage.removeItem(localKey(slot));
  }

  // A save as a small file (compressed inside), and back.
  async function toFile(text, meta) { return JSON.stringify({ scrapline: 1, meta, ...(await pack(text)) }); }
  async function fromFile(fileText) {
    const f = JSON.parse(fileText);
    return f && f.scrapline === 1 ? unpack(f) : fileText;   // a bare saveGame() text works too
  }
  async function download(filename, data) {
    await ready;
    if (downloads) return downloads.save({ filename, data });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  return { SLOTS, ready, list, put, get, del, toFile, fromFile, download, where: () => (cloud ? 'cloud' : 'browser') };
})();
