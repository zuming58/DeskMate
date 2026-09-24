// Electron 44 clipboard operations are asynchronous. Keep contents in main only.
function createClipboardAccess(clipboard, ClipboardItem) {
  return {
    readText: () => clipboard.readText(),
    async writeText(text) {
      await clipboard.writeText(text);
      if (await clipboard.readText() !== text) throw new Error('clipboard-verification-failed');
    },
    async snapshot() {
      const items = await clipboard.read();
      // Materialize every payload before the selection marker replaces the clipboard.
      return Promise.all(items.filter(item => item.types.length > 0).map(async item => {
        const entries = await Promise.all(item.types.map(async type => [type, await item.getType(type)]));
        return new ClipboardItem(Object.fromEntries(entries));
      }));
    },
    async restore(items) {
      if (items.length) await clipboard.write(items);
      else await clipboard.clear();
    },
  };
}

module.exports = { createClipboardAccess };
