import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconAlertCircle as AlertCircle,
  IconCopy as Copy,
  IconDeviceFloppy as DeviceFloppy,
  IconPlayerPause as PlayerPause,
  IconPlayerPlay as PlayerPlay,
  IconPlus as Plus,
  IconRefresh as Refresh,
  IconTrash as Trash,
} from "@tabler/icons-react";
import { CompanionFace } from "./CompanionFace.jsx";
import { voiceAdapters } from "./adapters/voiceAdapters.js";
import {
  CHOREOGRAPHY_BEAT_MS,
  CHOREOGRAPHY_EXPRESSIONS,
  CHOREOGRAPHY_LABELS,
  CHOREOGRAPHY_PITCH,
  CHOREOGRAPHY_YAW,
  choreographyExpressionId,
  choreographyPreviewFrame,
  createChoreographyDraft,
  createEmptyBeat,
  validateChoreographyDraft,
} from "./domain/choreography.js";
import { Button, Card, SectionTitle, Segmented, Select, StatusBadge } from "./ui.jsx";

const REASON_COPY = Object.freeze({
  "choreography-contract-invalid": "动作结构无效，请重新编辑。",
  "choreography-name-invalid": "动作名称需要 1–20 个字符。",
  "choreography-name-exists": "已经存在同名动作。",
  "choreography-beat-ms-invalid": "请选择允许的节拍时长。",
  "choreography-repeat-invalid": "循环次数只能是 1–3 次。",
  "choreography-beats-invalid": "自定义动作必须包含 2–8 拍。",
  "choreography-beat-invalid": "有一拍包含未支持的语义。",
  "choreography-empty": "至少一拍需要包含方向或表情变化。",
  "choreography-limit-reached": "最多只能保存 8 个自定义动作。",
  "choreography-not-found": "这个动作已经不存在，请刷新列表。",
  "choreography-transport-not-frozen": "自定义动作实体传输尚未接入。",
  "desktop-bridge-unavailable": "当前不是可用的 DeskMate 桌面环境。",
});

function reasonCopy(reason) { return REASON_COPY[reason] || "操作未完成，请稍后重试。"; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function ChoreographyEditor({ currentExpression, notify }) {
  const [actions, setActions] = useState([]);
  const [selectedName, setSelectedName] = useState("");
  const [draft, setDraft] = useState(() => createChoreographyDraft());
  const [adapter, setAdapter] = useState({ ready: false, state: "not-ready", reason: "choreography-status-not-read" });
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState({ running: false, beatIndex: -1, loop: 0, yaw: "center", pitch: "center", expression: null });
  const previewTimerRef = useRef(null);
  const previewGenerationRef = useRef(0);
  const previewFrameRef = useRef({ yaw: "center", pitch: "center", expression: null });

  const stopPreview = useCallback((announce = false) => {
    previewGenerationRef.current += 1;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
    previewFrameRef.current = { yaw: "center", pitch: "center", expression: null };
    setPreview({ running: false, beatIndex: -1, loop: 0, ...previewFrameRef.current });
    if (announce) notify("软件预览已停止并回到中位；没有发送实体动作");
  }, [notify]);

  const refresh = useCallback(async () => {
    const [list, status] = await Promise.all([
      voiceAdapters.desktop.listChoreographies().catch(() => ({ ok: false, actions: [] })),
      voiceAdapters.desktop.getChoreographyStatus().catch(() => ({ ready: false, state: "not-ready", reason: "choreography-status-unavailable" })),
    ]);
    setActions(Array.isArray(list?.actions) ? list.actions : []);
    setAdapter(status || { ready: false, state: "not-ready", reason: "choreography-status-unavailable" });
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      previewGenerationRef.current += 1;
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [refresh]);

  const updateBeat = (index, key, value) => setDraft((current) => ({ ...current, beats: current.beats.map((beat, beatIndex) => beatIndex === index ? { ...beat, [key]: value } : beat) }));
  const addBeat = () => setDraft((current) => current.beats.length >= 8 ? current : { ...current, beats: [...current.beats, createEmptyBeat()] });
  const removeBeat = () => setDraft((current) => current.beats.length <= 2 ? current : { ...current, beats: current.beats.slice(0, -1) });
  const selectSaved = (name) => {
    stopPreview(false);
    setSelectedName(name);
    const action = actions.find((item) => item.name === name);
    if (action) setDraft(clone(action));
  };
  const newDraft = () => { stopPreview(false); setSelectedName(""); setDraft(createChoreographyDraft()); };

  const startPreview = () => {
    const checked = validateChoreographyDraft(draft);
    if (!checked.ok) return notify(`无法预览：${reasonCopy(checked.reason)}`);
    stopPreview(false);
    const generation = previewGenerationRef.current;
    const action = checked.value;
    let step = 0;
    const total = action.beats.length * action.repeat;
    const advance = () => {
      if (generation !== previewGenerationRef.current) return;
      if (step >= total) {
        previewFrameRef.current = { yaw: "center", pitch: "center", expression: null };
        setPreview({ running: false, beatIndex: -1, loop: action.repeat, ...previewFrameRef.current });
        notify("软件预览完成：已回到中位并恢复最新外部表情；没有发送实体动作");
        return;
      }
      const beatIndex = step % action.beats.length;
      previewFrameRef.current = choreographyPreviewFrame(previewFrameRef.current, action.beats[beatIndex]);
      setPreview({ running: true, beatIndex, loop: Math.floor(step / action.beats.length) + 1, ...previewFrameRef.current });
      step += 1;
      previewTimerRef.current = setTimeout(advance, action.beatMs);
    };
    advance();
  };

  const save = async () => {
    const checked = validateChoreographyDraft(draft);
    if (!checked.ok) return notify(`保存失败：${reasonCopy(checked.reason)}`);
    setBusy("save");
    try {
      const result = await voiceAdapters.desktop.saveChoreography({ action: checked.value, previousName: selectedName });
      if (!result?.ok) return notify(`保存失败：${reasonCopy(result?.reason)}`);
      setActions(result.actions || []);
      setSelectedName(result.action.name);
      setDraft(clone(result.action));
      notify(`自定义动作“${result.action.name}”已保存到本机`);
    } finally { setBusy(""); }
  };

  const copyAction = async () => {
    if (!selectedName) return notify("请先选择一个已保存动作再复制");
    setBusy("copy");
    try {
      const result = await voiceAdapters.desktop.copyChoreography(selectedName);
      if (!result?.ok) return notify(`复制失败：${reasonCopy(result?.reason)}`);
      setActions(result.actions || []);
      setSelectedName(result.action.name);
      setDraft(clone(result.action));
      notify(`已复制为“${result.action.name}”`);
    } finally { setBusy(""); }
  };

  const deleteAction = async () => {
    if (!selectedName) return notify("当前是未保存草稿，无需删除");
    setBusy("delete");
    try {
      const result = await voiceAdapters.desktop.deleteChoreography(selectedName);
      if (!result?.ok) return notify(`删除失败：${reasonCopy(result?.reason)}`);
      setActions(result.actions || []);
      newDraft();
      notify("自定义动作已从本机删除");
    } finally { setBusy(""); }
  };

  const runReal = async () => {
    const checked = validateChoreographyDraft(draft);
    if (!checked.ok) return notify(`无法执行：${reasonCopy(checked.reason)}`);
    if (adapter.ready !== true) return notify(`实体执行不可用：${reasonCopy(adapter.reason)}`);
    setBusy("run");
    try {
      const result = await voiceAdapters.desktop.runChoreography(checked.value);
      notify(result?.ok ? "自定义动作请求已发送；实体结果仍需端点证据和现场观察" : `实体执行未开始：${reasonCopy(result?.reason)}`);
    } finally { setBusy(""); }
  };

  const runSafety = async (kind) => {
    setBusy(kind);
    try {
      const result = kind === "stop" ? await voiceAdapters.desktop.stopAndCenter("UI") : await voiceAdapters.desktop.emergencyStop("UI");
      notify(result?.ok ? (kind === "stop" ? "已发送停止并回中" : "急停请求已发送") : `安全操作失败：${result?.reason || "motion-operation-failed"}`);
    } finally { setBusy(""); }
  };

  const yawDegrees = preview.yaw === "left" ? -12 : preview.yaw === "right" ? 12 : 0;
  const pitchDegrees = preview.pitch === "up" ? -10 : preview.pitch === "down" ? 10 : 0;
  const expression = choreographyExpressionId(preview.expression) || currentExpression;

  return (
    <Card className="choreography-editor">
      <SectionTitle index="02" title="自定义舞蹈" description="同列同步，逐列播放。" action={<span className="motion-heading-actions"><StatusBadge tone={adapter.ready ? "success" : "demo"}>{adapter.ready ? "实体适配器已就绪" : "实体适配器待接入"}</StatusBadge><Button icon={Refresh} onClick={() => { void refresh(); }}>刷新适配器</Button></span>} />
      <div className="choreography-toolbar">
        <label><span>已保存动作</span><Select value={selectedName} onChange={selectSaved} ariaLabel="已保存的自定义动作"><option value="">新建草稿</option>{actions.map((action) => <option key={action.name} value={action.name}>{action.name}</option>)}</Select></label>
        <Button icon={Plus} onClick={newDraft}>新建</Button>
        <Button icon={Copy} disabled={!selectedName || busy !== ""} onClick={() => { void copyAction(); }}>复制</Button>
        <Button icon={Trash} variant="ghost" disabled={!selectedName || busy !== ""} onClick={() => { void deleteAction(); }}>删除</Button>
        <small>{actions.length} / 8</small>
      </div>
      <div className="choreography-settings">
        <label><span>动作名称</span><input value={draft.name} maxLength={20} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label><span>节拍时长</span><Segmented compact value={String(draft.beatMs)} onChange={(value) => setDraft((current) => ({ ...current, beatMs: Number(value) }))} options={CHOREOGRAPHY_BEAT_MS.map((value) => ({ value: String(value), label: `${value} ms` }))} /></label>
        <label><span>循环次数</span><Segmented compact value={String(draft.repeat)} onChange={(value) => setDraft((current) => ({ ...current, repeat: Number(value) }))} options={[1, 2, 3].map((value) => ({ value: String(value), label: `${value} 次` }))} /></label>
      </div>
      <div className="choreography-beat-tools"><strong>{draft.beats.length} 拍</strong><span><Button icon={Plus} disabled={draft.beats.length >= 8} onClick={addBeat}>增加一拍</Button><Button icon={Trash} disabled={draft.beats.length <= 2} onClick={removeBeat}>移除末拍</Button></span></div>
      <div className="choreography-table-wrap">
        <div className="choreography-table" style={{ "--beat-count": draft.beats.length }}>
          <div className="choreography-corner">轨道</div>{draft.beats.map((_, index) => <div key={`head-${index}`} className={preview.running && preview.beatIndex === index ? "is-active" : ""}>第 {index + 1} 拍</div>)}
          {[["yaw", "Yaw 左右", CHOREOGRAPHY_YAW], ["pitch", "Pitch 上下", CHOREOGRAPHY_PITCH], ["expression", "表情", CHOREOGRAPHY_EXPRESSIONS]].map(([key, label, values]) => <div className="choreography-row" key={key}><strong>{label}</strong>{draft.beats.map((beat, index) => <Select key={`${key}-${index}`} value={beat[key]} onChange={(value) => updateBeat(index, key, value)} ariaLabel={`${label}第 ${index + 1} 拍`}>{values.map((value) => <option key={value} value={value}>{CHOREOGRAPHY_LABELS[key][value]}</option>)}</Select>)}</div>)}
        </div>
      </div>
      <div className="choreography-preview-layout">
        <div className="choreography-preview-face" style={{ "--preview-yaw": `${yawDegrees}deg`, "--preview-pitch": `${pitchDegrees}deg` }}><CompanionFace expressionId={expression} alt="自定义舞蹈软件预览" /><small>{preview.running ? `软件预览 · 第 ${preview.loop} 轮 · 第 ${preview.beatIndex + 1} 拍` : "软件预览 · 中位 · 最新外部表情"}</small></div>
        <div className="choreography-actions">
          <Button icon={DeviceFloppy} variant="primary" disabled={busy !== ""} onClick={() => { void save(); }}>保存动作</Button>
          <Button icon={preview.running ? PlayerPause : PlayerPlay} disabled={busy !== ""} onClick={() => preview.running ? stopPreview(true) : startPreview()}>{preview.running ? "停止软件预览" : "软件预览"}</Button>
          <Button icon={PlayerPlay} disabled={!adapter.ready || busy !== ""} onClick={() => { void runReal(); }}>实体执行</Button>
          <div className="motion-safety-actions"><Button icon={PlayerPause} disabled={busy !== ""} onClick={() => { void runSafety("stop"); }}>停止并回中</Button><Button icon={AlertCircle} variant="danger" disabled={busy !== ""} onClick={() => { void runSafety("estop"); }}>急停</Button></div>
        </div>
      </div>
      <div className="choreography-boundary-note"><AlertCircle size={16} stroke={1.8} /><span><strong>软件预览不等于实体执行</strong>传输尚未接入；实体按钮保持禁用，预览不发送舵机指令。</span></div>
    </Card>
  );
}
