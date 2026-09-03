import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconAlertCircle as AlertCircle,
  IconCopy as Copy,
  IconDeviceFloppy as DeviceFloppy,
  IconPlayerPause as PlayerPause,
  IconPlayerPlay as PlayerPlay,
  IconPlus as Plus,
  IconRefresh as Refresh,
  IconStar as Star,
  IconTrash as Trash,
} from "@tabler/icons-react";
import { expressionAssetUrl } from "./CompanionFace.jsx";
import { voiceAdapters } from "./adapters/voiceAdapters.js";
import {
  CHOREOGRAPHY_BEAT_MS,
  CHOREOGRAPHY_EXPRESSIONS,
  CHOREOGRAPHY_LABELS,
  CHOREOGRAPHY_PITCH,
  CHOREOGRAPHY_YAW,
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
  "choreography-interface-unavailable": "当前 EasyInput 固件还没有提供自定义动作接口。",
  "easyinput-not-connected": "EasyInput 尚未连接。",
  "adapter-unavailable": "小智舵机适配器尚未就绪。",
  "not-ready": "小智尚未回中就绪，请稍后重试。",
  "emergency-stopped": "急停仍处于锁定状态，请先解除急停并回中。",
  "faulted": "小智动作端报告故障，请先停止并检查设备。",
  "choreography-timeout": "等待小智完成动作超时。",
  "motion-settings-invalid": "动作角度或速度设置无效。",
  "desktop-bridge-unavailable": "当前不是可用的 DeskMate 桌面环境。",
});

function reasonCopy(reason) { return REASON_COPY[reason] || "操作未完成，请稍后重试。"; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
const EXPRESSION_ASSETS = Object.freeze({ completed: "happy", thinking: "think", working: "focus" });
const BUILT_IN_DANCE_ID = "__built_in_default_dance__";

function normalizeEditorAction(action) {
  const next = clone(action);
  next.beats = next.beats.map((beat) => ({
    ...beat,
    expression: CHOREOGRAPHY_EXPRESSIONS.includes(beat.expression) ? beat.expression : "hold",
  }));
  return next;
}

function TrackChoices({ beatIndex, label, value, values, onChange, expression = false, disabled = false }) {
  return (
    <div className={`choreography-track-choices ${expression ? "is-expression" : ""}`} role="group" aria-label={`第 ${beatIndex + 1} 拍 ${label}`}>
      {values.filter((item) => item !== "hold").map((item) => {
        const selected = value === item;
        return (
          <button
            key={item}
            type="button"
            className="choreography-choice"
            disabled={disabled}
            aria-label={`第 ${beatIndex + 1} 拍 ${label}${CHOREOGRAPHY_LABELS[expression ? "expression" : label === "Yaw" ? "yaw" : "pitch"][item]}${selected ? "，再次点击清除" : ""}`}
            aria-pressed={selected}
            onClick={() => onChange(selected ? "hold" : item)}
          >
            {expression && <img src={expressionAssetUrl(EXPRESSION_ASSETS[item])} alt="" draggable="false" />}
            <span>{CHOREOGRAPHY_LABELS[expression ? "expression" : label === "Yaw" ? "yaw" : "pitch"][item]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ChoreographyEditor({ notify, onDanceLibraryChange }) {
  const [actions, setActions] = useState([]);
  const [builtInDance, setBuiltInDance] = useState(null);
  const [selectedName, setSelectedName] = useState(BUILT_IN_DANCE_ID);
  const [defaultDanceName, setDefaultDanceName] = useState("");
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
    const builtIn = list?.builtInDance && typeof list.builtInDance === "object" ? normalizeEditorAction(list.builtInDance) : null;
    setBuiltInDance(builtIn);
    setDefaultDanceName(typeof list?.defaultDanceName === "string" ? list.defaultDanceName : "");
    onDanceLibraryChange?.(list);
    setAdapter(status || { ready: false, state: "not-ready", reason: "choreography-status-unavailable" });
  }, [onDanceLibraryChange]);

  useEffect(() => {
    void refresh();
    return () => {
      previewGenerationRef.current += 1;
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    if (selectedName === BUILT_IN_DANCE_ID && builtInDance) setDraft(clone(builtInDance));
  }, [builtInDance, selectedName]);

  const updateBeat = (index, key, value) => setDraft((current) => ({ ...current, beats: current.beats.map((beat, beatIndex) => beatIndex === index ? { ...beat, [key]: value } : beat) }));
  const addBeat = () => setDraft((current) => current.beats.length >= 8 ? current : { ...current, beats: [...current.beats, createEmptyBeat()] });
  const removeBeat = () => setDraft((current) => current.beats.length <= 2 ? current : { ...current, beats: current.beats.slice(0, -1) });
  const selectSaved = (name) => {
    stopPreview(false);
    setSelectedName(name);
    const action = name === BUILT_IN_DANCE_ID ? builtInDance : actions.find((item) => item.name === name);
    if (action) setDraft(normalizeEditorAction(action));
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
        notify("软件预览完成：轨道已回到起始状态；没有发送实体动作");
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
      setDefaultDanceName(result.defaultDanceName || "");
      setSelectedName(result.action.name);
      setDraft(clone(result.action));
      onDanceLibraryChange?.(result);
      notify(`自定义动作“${result.action.name}”已保存到本机`);
    } finally { setBusy(""); }
  };

  const copyAction = async () => {
    if (!selectedName) return notify("请先选择一个已保存动作再复制");
    if (selectedName === BUILT_IN_DANCE_ID) {
      if (!builtInDance) return notify("内置默认舞蹈尚未加载，请刷新后重试");
      stopPreview(false);
      setSelectedName("");
      setDraft({ ...clone(builtInDance), name: "我的舞蹈" });
      notify("已复制内置默认舞蹈；修改名称或节拍后保存即可");
      return;
    }
    setBusy("copy");
    try {
      const result = await voiceAdapters.desktop.copyChoreography(selectedName);
      if (!result?.ok) return notify(`复制失败：${reasonCopy(result?.reason)}`);
      setActions(result.actions || []);
      setDefaultDanceName(result.defaultDanceName || "");
      setSelectedName(result.action.name);
      setDraft(clone(result.action));
      onDanceLibraryChange?.(result);
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
      setDefaultDanceName(result.defaultDanceName || "");
      onDanceLibraryChange?.(result);
      newDraft();
      notify("自定义动作已从本机删除");
    } finally { setBusy(""); }
  };

  const activateDance = async () => {
    if (!selectedName) return notify("请先保存这个动作，再把它激活为跳舞动作");
    setBusy("default");
    try {
      const next = selectedName === BUILT_IN_DANCE_ID ? "" : selectedName;
      const result = await voiceAdapters.desktop.setDefaultDance(next);
      if (!result?.ok) return notify(`设置失败：${reasonCopy(result?.reason)}`);
      setDefaultDanceName(result.defaultDanceName || "");
      setActions(result.actions || actions);
      onDanceLibraryChange?.(result);
      notify(next ? `“${next}”已激活；以后点击“跳舞”或说“小智跳个舞”都会执行它` : "内置默认舞蹈已激活");
    } finally { setBusy(""); }
  };

  const runReal = async () => {
    const checked = validateChoreographyDraft(draft);
    if (!checked.ok) return notify(`无法执行：${reasonCopy(checked.reason)}`);
    if (adapter.ready !== true) return notify(`实体执行不可用：${reasonCopy(adapter.reason)}`);
    setBusy("run");
    try {
      const result = await voiceAdapters.desktop.runChoreography({ action: checked.value, source: "UI" });
      setAdapter(result?.ok ? { ready: true, state: "ready", reason: "" } : { ready: false, state: result?.state || "failed", reason: result?.reason || "choreography-execute-failed" });
      notify(result?.ok ? "自定义动作已由小智执行完成并回中" : `实体执行未开始：${reasonCopy(result?.reason)}`);
    } finally { setBusy(""); }
  };

  const runSafety = async (kind) => {
    setBusy(kind);
    try {
      const result = kind === "stop" ? await voiceAdapters.desktop.stopAndCenter("UI") : await voiceAdapters.desktop.emergencyStop("UI");
      notify(result?.ok ? (kind === "stop" ? "已发送停止并回中" : "急停请求已发送") : `安全操作失败：${result?.reason || "motion-operation-failed"}`);
    } finally { setBusy(""); }
  };

  const previewSummary = {
    yaw: CHOREOGRAPHY_LABELS.yaw[preview.yaw] || "保持",
    pitch: CHOREOGRAPHY_LABELS.pitch[preview.pitch] || "保持",
    expression: CHOREOGRAPHY_LABELS.expression[preview.expression] || "保持",
  };
  const builtInSelected = selectedName === BUILT_IN_DANCE_ID;
  const savedCustomSelected = Boolean(selectedName) && !builtInSelected;
  const activeDanceSelected = builtInSelected ? defaultDanceName === "" : Boolean(selectedName) && selectedName === defaultDanceName;
  const activeDanceLabel = defaultDanceName || "内置默认舞蹈";
  const activationLabel = activeDanceSelected
    ? "当前已激活"
    : !selectedName
      ? "保存后可激活"
      : builtInSelected
        ? "恢复为内置舞蹈"
        : "激活为跳舞动作";

  return (
    <Card className="choreography-editor">
      <SectionTitle index="02" title="自定义舞蹈" description="选择即可查看节拍；保存自己的舞蹈后，再激活为快速动作和语音“跳舞”的内容。" action={<span className="motion-heading-actions"><StatusBadge tone={adapter.ready ? "success" : "demo"}>{adapter.ready ? "实体适配器已就绪" : "实体适配器待接入"}</StatusBadge><Button icon={Refresh} onClick={() => { void refresh(); }}>刷新适配器</Button></span>} />
      <div className="choreography-library">
        <div className="choreography-selection-bar">
          <label className="choreography-selector-field"><span>舞蹈动作</span><Select value={selectedName} onChange={selectSaved} ariaLabel="内置或已保存的舞蹈动作"><option value={BUILT_IN_DANCE_ID}>内置默认舞蹈{defaultDanceName === "" ? " · 当前已激活" : ""}</option><option value="">新建草稿（未保存）</option>{actions.map((action) => <option key={action.name} value={action.name}>{action.name}{action.name === defaultDanceName ? " · 当前已激活" : ""}</option>)}</Select></label>
          <div className="choreography-active-dance" role="status" aria-live="polite"><span>当前跳舞动作</span><strong>{activeDanceLabel}</strong></div>
          <Button
            className="choreography-activate-button"
            icon={Star}
            variant={savedCustomSelected && !activeDanceSelected ? "primary" : "secondary"}
            disabled={!selectedName || activeDanceSelected || busy !== ""}
            onClick={() => { void activateDance(); }}
          >{activationLabel}</Button>
        </div>
        <div className="choreography-toolbar">
          <div className="choreography-library-actions">
            <Button icon={Plus} onClick={newDraft}>新建</Button>
            <Button icon={Copy} disabled={!selectedName || busy !== ""} onClick={() => { void copyAction(); }}>复制</Button>
            <Button icon={Trash} variant="ghost" disabled={!selectedName || builtInSelected || busy !== ""} onClick={() => { void deleteAction(); }}>删除</Button>
          </div>
          <small>已保存 {actions.length} / 8</small>
        </div>
      </div>
      <div className="choreography-settings">
        <label><span>动作名称</span><input value={draft.name} disabled={builtInSelected} maxLength={20} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label><span>节拍时长</span><Segmented compact disabled={builtInSelected} value={String(draft.beatMs)} onChange={(value) => setDraft((current) => ({ ...current, beatMs: Number(value) }))} options={CHOREOGRAPHY_BEAT_MS.map((value) => ({ value: String(value), label: `${value} ms` }))} /></label>
        <label><span>循环次数</span><Segmented compact disabled={builtInSelected} value={String(draft.repeat)} onChange={(value) => setDraft((current) => ({ ...current, repeat: Number(value) }))} options={[1, 2, 3].map((value) => ({ value: String(value), label: `${value} 次` }))} /></label>
      </div>
      <div className="choreography-beat-tools"><strong>{draft.beats.length} 拍 <small>{builtInSelected ? "内置动作只读；复制后可修改" : "未选择 = 保持"}</small></strong><span><Button icon={Plus} disabled={builtInSelected || draft.beats.length >= 8} onClick={addBeat}>增加一拍</Button><Button icon={Trash} disabled={builtInSelected || draft.beats.length <= 2} onClick={removeBeat}>移除末拍</Button></span></div>
      <div className="choreography-table-wrap">
        <div className="choreography-table" style={{ "--beat-count": draft.beats.length }}>
          <div className="choreography-corner">轨道</div>{draft.beats.map((_, index) => <div key={`head-${index}`} className={preview.running && preview.beatIndex === index ? "is-active" : ""}>第 {index + 1} 拍</div>)}
          <div className="choreography-row"><strong>Yaw 左右</strong>{draft.beats.map((beat, index) => <TrackChoices key={`yaw-${index}`} beatIndex={index} label="Yaw" value={beat.yaw} values={CHOREOGRAPHY_YAW} disabled={builtInSelected} onChange={(value) => updateBeat(index, "yaw", value)} />)}</div>
          <div className="choreography-row"><strong>Pitch 上下</strong>{draft.beats.map((beat, index) => <TrackChoices key={`pitch-${index}`} beatIndex={index} label="Pitch" value={beat.pitch} values={CHOREOGRAPHY_PITCH} disabled={builtInSelected} onChange={(value) => updateBeat(index, "pitch", value)} />)}</div>
          <div className="choreography-row"><strong>表情</strong>{draft.beats.map((beat, index) => <TrackChoices key={`expression-${index}`} beatIndex={index} label="表情" value={beat.expression} values={CHOREOGRAPHY_EXPRESSIONS} expression disabled={builtInSelected} onChange={(value) => updateBeat(index, "expression", value)} />)}</div>
        </div>
      </div>
      <div className="choreography-preview-summary" role="status" aria-live="polite">
        <strong>{preview.running ? `软件预览 · 第 ${preview.loop} 轮 / 第 ${preview.beatIndex + 1} 拍` : "软件预览待开始"}</strong>
        <span>Yaw {previewSummary.yaw}</span><span>Pitch {previewSummary.pitch}</span><span>表情 {previewSummary.expression}</span>
      </div>
      <div className="choreography-actions">
        <Button icon={DeviceFloppy} variant="primary" disabled={builtInSelected || busy !== ""} onClick={() => { void save(); }}>保存</Button>
        <Button icon={preview.running ? PlayerPause : PlayerPlay} disabled={busy !== ""} onClick={() => preview.running ? stopPreview(true) : startPreview()}>{preview.running ? "停止预览" : "软件预览"}</Button>
        <Button icon={PlayerPlay} disabled={!adapter.ready || busy !== ""} title={adapter.ready ? "在小智上执行" : "实体传输尚未接入"} onClick={() => { void runReal(); }}>实体执行</Button>
        <Button icon={PlayerPause} disabled={busy !== ""} onClick={() => { void runSafety("stop"); }}>停止回中</Button>
        <Button icon={AlertCircle} variant="danger" disabled={busy !== ""} onClick={() => { void runSafety("estop"); }}>急停</Button>
      </div>
      <div className="choreography-boundary-note"><AlertCircle size={16} stroke={1.8} /><span>软件预览不等于实体执行；两者都只运行当前画面，不会改变已激活舞蹈。只有保存后再明确激活，快速“跳舞”和语音“小智跳个舞”才会改用它。</span></div>
    </Card>
  );
}
