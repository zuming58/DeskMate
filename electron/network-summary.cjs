function summarizeNetworkInterfaces(interfaces = {}) {
  const categories = new Set();
  let available = false;
  for (const [name, entries] of Object.entries(interfaces)) for (const entry of entries || []) {
    if (entry.internal || !entry.address) continue;
    available = true;
    if (/wi-?fi|wireless|wlan/i.test(name)) categories.add("wifi");
    else if (/ethernet|lan|以太网/i.test(name)) categories.add("ethernet");
    else categories.add("unknown");
  }
  return { available, transports: [...categories], lanAudio: "easyinput-audio-capture-v1", sameLanPossible: available };
}
module.exports = { summarizeNetworkInterfaces };
