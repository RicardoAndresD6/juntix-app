'use strict';
// Almacenamiento en un archivo JSON (para el computador local o un VPS). Un solo proceso.
const fs = require('fs');
const path = require('path');
const core = require('../core.js');

module.exports = function fileStore(dataDir) {
  const file = path.join(dataDir, 'juntix.json');
  let state;
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { state = core.emptyState(); }

  function save() {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, file);
  }

  const hits = new Map();
  setInterval(() => { hits.clear(); }, 3600 * 1000).unref();

  return {
    save: save,
    ready: async () => {},
    read: async () => state,
    write: async (fn) => {
      // Trabaja sobre una copia: si fn falla, el estado no queda a medias.
      const draft = JSON.parse(JSON.stringify(state));
      const result = fn(draft);
      state = draft;
      save();
      return result;
    },
    limited: async (key, max, windowMs) => {
      const now = Date.now();
      const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
      arr.push(now);
      hits.set(key, arr);
      return arr.length > max;
    }
  };
};
