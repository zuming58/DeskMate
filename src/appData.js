export const pageMeta = {
  dashboard: { title: "工作台", subtitle: "查看桌宠状态、AI 任务进度与设备运行情况" },
  voice: { title: "语音输入", subtitle: "专注录音、实时转写与智能整理" },
  companion: { title: "AI 陪伴", subtitle: "陪伴对话、记忆提醒、表情与动作的统一入口" },
  history: { title: "历史记录", subtitle: "管理、搜索和导出最近的语音输入" },
  vocabulary: { title: "词库", subtitle: "提高专有名词识别率并自动修正常见表达" },
  keymap: { title: "按键配置", subtitle: "配置键盘按键、旋钮和快捷动作" },
  connections: { title: "设备与连接", subtitle: "管理 USB、Wi-Fi、蓝牙、麦克风与提示音" },
  agents: { title: "AI 联动", subtitle: "把编程助手的运行状态映射到桌宠灯效和表情" },
  expressions: { title: "表情库", subtitle: "管理内置表情、收藏与工作状态映射" },
  editor: { title: "表情编辑", subtitle: "调整眼睛、嘴型、颜色和动画节奏" },
  motion: { title: "动作编排", subtitle: "设计左右摇头、上下点头与组合动作" },
  sensors: { title: "环境感知", subtitle: "查看温湿度、环境光与用户方向检测" },
  settings: { title: "设置与诊断", subtitle: "管理快捷键、输入方式、外观和系统诊断" },
};

export const historyItems = [
  { id: 1, time: "16:55", date: "今天", duration: "31 秒", count: "192 字", text: "我们先把软件端的桌面工作台做好，再等待硬件固件和通信协议，之后把表情、动作以及环境传感器逐项接入。", rawText: "我们先把软件端的桌面工作台做好，再等待硬件固件和通信协议，之后把表情、动作以及环境传感器逐项接入。", organizer: { mode: "raw", model: "local-rules", durationMs: 0, status: "success", fallback: false } },
  { id: 2, time: "14:31", date: "今天", duration: "12 秒", count: "46 字", text: "把 Codex 的工作状态映射到桌宠表情，提取信息时显示专注，等待确认时显示倾听。", rawText: "把 Codex 的工作状态映射到桌宠表情，提取信息时显示专注，等待确认时显示倾听。", organizer: { mode: "raw", model: "local-rules", durationMs: 0, status: "success", fallback: false } },
  { id: 3, time: "11:08", date: "今天", duration: "19 秒", count: "83 字", text: "桌宠屏幕需要根据环境光自动调节亮度，同时保留手动亮度上限，夜间不能太刺眼。", rawText: "桌宠屏幕需要根据环境光自动调节亮度，同时保留手动亮度上限，夜间不能太刺眼。", organizer: { mode: "raw", model: "local-rules", durationMs: 0, status: "success", fallback: false } },
  { id: 4, time: "09:42", date: "昨天", duration: "8 秒", count: "31 字", text: "按键一设置为语音输入，按键二设置为回车，旋钮控制音量。", rawText: "按键一设置为语音输入，按键二设置为回车，旋钮控制音量。", organizer: { mode: "raw", model: "local-rules", durationMs: 0, status: "success", fallback: false } },
];

export const agents = [
  { id: "codex", name: "Codex", state: "工作中", detail: "正在整理桌宠开发文档", progress: 68, tone: "blue" },
  { id: "claude", name: "Claude Code", state: "待命", detail: "最近一次活动：18 分钟前", progress: 0, tone: "violet" },
  { id: "hermes", name: "Hermes", state: "未连接", detail: "等待本地状态适配器", progress: 0, tone: "amber" },
  { id: "workbody", name: "Workbody", state: "未配置", detail: "可添加自定义进程规则", progress: 0, tone: "cyan" },
];

export const expressionPresets = [
  { id: "focus", name: "默认", description: "放松、专注的日常状态", mood: "focus", color: "cyan" },
  { id: "sleep", name: "眨眼", description: "自然短暂闭眼，增加生命感", mood: "sleep", color: "indigo" },
  { id: "happy", name: "开心", description: "任务完成或收到表扬", mood: "happy", color: "green" },
  { id: "sad", name: "难过", description: "温柔低落，需要安慰", mood: "sad", color: "blue" },
  { id: "alert", name: "生气", description: "错误、受阻或需要强调", mood: "alert", color: "amber" },
  { id: "think", name: "思考", description: "规划与推理阶段", mood: "think", color: "violet" },
  { id: "listen", name: "聆听", description: "等待用户讲话或确认", mood: "listen", color: "blue" },
];

export const keyActions = ["语音输入", "语音编辑", "回车", "退格", "全选", "复制", "粘贴", "撤销", "快捷键", "固定文字", "禁用"];
