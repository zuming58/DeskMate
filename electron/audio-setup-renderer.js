const bridge = globalThis.easyInputAudioSetup;
const form = document.getElementById("setup-form");
const confirmPanel = document.getElementById("confirm");
const status = document.getElementById("status");
const adapter = document.getElementById("adapter");
const port = document.getElementById("port");
const diff = document.getElementById("diff");
const previewButton = document.getElementById("preview");
const commitButton = document.getElementById("commit");
let confirmationToken = "";

const labels = { "/wifi_ssid": "Wi-Fi 名称", "/wifi_password": "Wi-Fi 密码", "/audio_host": "电脑接收网卡", "/audio_port": "音频端口" };
function showStatus(message, error = false) { status.textContent = message; status.classList.toggle("is-error", error); }
function reasonText(reason) {
  return ({
    "config-device-disconnected": "EasyInput 未连接或板上配置暂时不可读。",
    "audio-setup-ssid-invalid": "Wi-Fi 名称为空、过长或包含控制字符。",
    "audio-setup-password-invalid": "Wi-Fi 密码过长或包含非法字符。",
    "audio-setup-adapter-invalid": "请选择仍然可用的非回环 IPv4 网卡。",
    "audio-setup-port-invalid": "端口必须在 1024～65535 之间。",
    "config-confirmation-expired": "确认已过期，请重新预览。",
    "config-changed-concurrently": "板上配置已变化，请重新预览。",
  })[reason] || `操作失败：${reason || "unknown-error"}`;
}

async function load() {
  const result = await bridge.load();
  if (!result?.ok) return showStatus(reasonText(result?.reason), true);
  adapter.replaceChildren(...result.adapters.map((item) => { const option = document.createElement("option"); option.value = item.id; option.textContent = item.label; return option; }));
  if (result.setup?.adapterId) adapter.value = result.setup.adapterId;
  port.value = result.setup?.port || result.defaults?.port || 17333;
  showStatus(result.setup?.configured ? "板上已有音频配置。密码不会回显；留空表示本次写入空密码。" : "请选择网卡并填写网络配置。只有确认后才会写入板子。");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault(); previewButton.disabled = true;
  try {
    const result = await bridge.preview({ ssid: document.getElementById("ssid").value, password: document.getElementById("password").value, adapterId: adapter.value, port: Number(port.value) });
    if (!result?.ok) return showStatus(reasonText(result?.reason), true);
    confirmationToken = result.token;
    diff.replaceChildren(...result.diff.map((item) => { const li = document.createElement("li"); li.textContent = `${labels[item.path] || item.path}：将更新${item.adapter ? `为 ${item.adapter}` : ""}`; return li; }));
    form.hidden = true; confirmPanel.hidden = false; showStatus("请核对修改范围；不会显示密码或真实 IP。", false);
  } finally { previewButton.disabled = false; }
});

document.getElementById("back").addEventListener("click", () => { confirmationToken = ""; confirmPanel.hidden = true; form.hidden = false; });
document.getElementById("cancel").addEventListener("click", () => bridge.close());
commitButton.addEventListener("click", async () => {
  commitButton.disabled = true;
  try {
    const result = await bridge.commit(confirmationToken); confirmationToken = "";
    if (!result?.ok) { confirmPanel.hidden = true; form.hidden = false; return showStatus(reasonText(result?.reason), true); }
    showStatus("配置已写入并回读确认。窗口即将关闭。", false); setTimeout(() => bridge.close(), 700);
  } finally { commitButton.disabled = false; }
});

void load().catch(() => showStatus("音频设置窗口初始化失败。", true));
