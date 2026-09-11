import { useCallback, useEffect, useRef, useState } from 'react';
import { IconArrowUpRight, IconActivity, IconBrain, IconCheck, IconChevronRight, IconCode, IconDatabase, IconDeviceDesktop, IconKeyboard, IconLink, IconMessageCircle2, IconMicrophone2, IconRefresh, IconRobot, IconSparkles } from '@tabler/icons-react';
import { BrandLogo } from './BrandLogo.jsx';
import { useAppStore } from './store/appStore.js';
import { dashboardHardwareStatus } from './domain/dashboardStatus.js';
import { workbenchProjects, workbenchSchedule, workbenchTime } from './domain/workbenchOverview.js';
import { Button, Card, StatusBadge } from './ui.jsx';
import './workbench-dashboard.css';

const number = value => typeof value === 'number' ? value.toLocaleString('zh-CN') : '—';
const taskStates = { working: ['工作中', 'demo'], thinking: ['思考中', 'demo'], waiting: ['等你确认', 'warning'], error: ['遇到问题', 'warning'], completed: ['已完成', 'success'], idle: ['待命', 'neutral'] };

function PanelHeading({ icon: Icon, title, link, onClick, children }) {
  return <div className="wb-panel-heading"><h2><Icon size={19} stroke={1.7} />{title}</h2>{children || <button type="button" className="wb-text-link" onClick={onClick}>{link}<IconChevronRight size={15} /></button>}</div>;
}

function Connection({ icon: Icon, title, label, detail, tone = 'neutral', onClick }) {
  return <button type="button" className="wb-connection" onClick={onClick}><div className="wb-connection-top"><Icon size={19} /><span>{title}</span><IconChevronRight size={13} /></div><strong className={`wb-tone-${tone}`}><i />{label}</strong><small>{detail}</small></button>;
}

export function DashboardPage({ navigate }) {
  const { state } = useAppStore();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(false); const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setLoading(true);
    try {
      const result = await globalThis.desktopBridge?.getWorkbenchOverview?.();
      if (!result?.memory?.ready) throw Error('unavailable');
      if (mounted.current) { setOverview(result); setError(''); }
    } catch { if (mounted.current) setError(globalThis.desktopBridge ? '状态暂时无法读取；已有数据保留上次结果，尚未读取的数据不作推测。' : '浏览器预览无法读取本地数据，请使用 DeskMate 桌面应用。'); }
    finally { inFlight.current = false; if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; void refresh();
    const update = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(update, 15000);
    window.addEventListener('focus', update); document.addEventListener('visibilitychange', update);
    const off = globalThis.desktopBridge?.onPromptWorkbenchState?.(update);
    return () => { mounted.current = false; window.clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); off?.(); };
  }, [refresh]);
  const memory = overview?.memory; const policy = overview?.policy; const knowledge = overview?.knowledge;
  const hardware = dashboardHardwareStatus(state.runtime?.inputBridge);
  const board = state.runtime?.inputBridge || {}; const companion = state.runtime?.companion || {};
  const wake = overview?.wake; const services = overview?.services;
  const projects = workbenchProjects(state.runtime?.codexTasks?.tasks || []);
  const scene = overview?.scene;
  const activity = memory?.activity || [];
  const maxActivity = Math.max(1, ...activity.map(day => day.dictationCount + day.companionCount));
  const activeDays = activity.filter(day => day.dictationCount + day.companionCount > 0).length;
  const companionStatus = companion.active ? ({ listening: '正在聆听', speaking: '正在回答', thinking: '正在思考', connecting: '正在连接', stopping: '正在结束' }[companion.state] || '对话进行中') : wake?.enabled ? '后台唤醒已开启' : wake?.desiredEnabled ? '后台唤醒已暂停' : '可从陪伴页开始对话';
  const xiaozhiDisabled = board.xiaozhiHardware?.enabled === false;
  const xiaozhiLabel = xiaozhiDisabled ? '已关闭扩展' : !hardware.boardConnected ? '状态未确认' : { connected: 'Link 已连接', waiting: '等待连接', faulted: '连接异常', disabled: '未启用', unavailable: '状态不可读取' }[hardware.link.status];
  const metrics = [
    { label: '相伴时光', value: memory?.companionDays ? `第 ${number(memory.companionDays)}` : memory ? '0' : '—', unit: '天', icon: IconMessageCircle2, tone: 'violet', caption: memory?.firstCompanionDay ? `始于 ${memory.firstCompanionDay}` : '等待第一段陪伴对话', title: '按最早保留的陪伴对话或摘要起算的日历天数，不代表连续在线时长。' },
    { label: '今日语音输入', value: number(memory?.today?.dictationCount), unit: '次', icon: IconMicrophone2, tone: 'blue', caption: `已记录 ${number(memory?.today?.dictationCharacters)} 字`, title: '按本地自然日统计已落盘的最终听写记录；包含标点，不计录音中的片段。' },
    { label: '今日陪伴交流', value: number(memory?.today?.companionCount), unit: '条', icon: IconActivity, tone: 'cyan', caption: '你说过的有效对话', title: '只统计已落盘的用户最终发言，不重复计算助手回答。' },
    { label: '已确认长期记忆', value: number(memory?.longTermMemories), unit: '条', icon: IconBrain, tone: 'green', caption: `${number(memory?.pendingCandidates)} 条候选等待审核`, title: '只统计你已经确认的本地长期记忆，候选不计入。' },
  ];
  return <div className="page page--dashboard wb-overview">
    <div className="wb-intro"><div className="wb-greeting"><div className="wb-face"><BrandLogo alt="DeskMate 品牌标识" /></div><div><div className="wb-eyebrow">DESKMATE / OVERVIEW</div><h1>工作台</h1><p>今天的工作、陪伴与记忆，都在这里。</p></div></div><div className="wb-refresh"><small>{overview ? `${workbenchTime(overview.updatedAt)} 更新` : loading ? '正在读取本地状态' : '状态未取得'}</small><Button icon={IconRefresh} variant="ghost" disabled={loading} onClick={() => void refresh()}>{loading ? '读取中' : '刷新'}</Button></div></div>
    {error && <div className="wb-load-error" role="status">{error}</div>}
    <div className="wb-metrics">{metrics.map(item => <div className={`wb-metric wb-metric--${item.tone}`} key={item.label} title={item.title}><div><span>{item.label}</span><item.icon size={20} stroke={1.6} /></div><strong>{item.value}<small>{item.unit}</small></strong><p>{item.caption}</p></div>)}</div>
    <Card className="wb-connections-card"><PanelHeading icon={IconLink} title="连接与服务" link="设备与诊断" onClick={() => navigate('settings/diagnostics')} /><div className="wb-connections">
      <Connection icon={IconDeviceDesktop} title="DeskMate" label={!globalThis.desktopBridge ? '网页预览' : error ? '状态读取异常' : overview ? '本地核心运行中' : '状态待读取'} detail="Windows 桌面服务" tone={error ? 'warning' : overview ? 'success' : 'neutral'} onClick={() => navigate('settings/diagnostics')} />
      <Connection icon={IconKeyboard} title="EasyInput" label={hardware.boardConnected ? 'USB 已连接' : '未连接'} detail={hardware.boardConnected ? '实体按键可用' : '电脑端功能仍可使用'} tone={hardware.boardConnected ? 'success' : 'neutral'} onClick={() => navigate('settings/connections')} />
      <Connection icon={IconRobot} title="小智扩展" label={xiaozhiLabel} detail={xiaozhiDisabled ? '仅使用 EasyInput 模式' : '实体屏幕与云台'} tone={xiaozhiDisabled ? 'neutral' : hardware.tone} onClick={() => navigate('settings/connections')} />
      <Connection icon={IconMicrophone2} title="AI 语音服务" label={!services ? '待读取' : services.configured ? '已配置' : '待配置'} detail={services ? `识别 ${services.asr ? '✓' : '—'} · 对话 ${services.model ? '✓' : '—'} · 声音 ${services.tts ? '✓' : '—'}` : '识别 · 对话 · 声音'} tone={services?.configured ? 'demo' : 'neutral'} onClick={() => navigate('settings/account')} />
      <Connection icon={IconDatabase} title="KnowledgeOS" label={!knowledge ? '待读取' : knowledge.configured ? '已配置' : '未配置'} detail={knowledge?.configured ? `检索${knowledge.readEnabled ? '开启' : '关闭'} · 同步${knowledge.syncEnabled ? '开启' : '关闭'}` : '连接你的知识与记忆'} tone={knowledge?.configured ? 'demo' : 'neutral'} onClick={() => navigate('memory')} />
    </div></Card>
    <div className="wb-main-grid">
      <Card className="wb-activity"><PanelHeading icon={IconActivity} title="最近 7 天" link="历史记录" onClick={() => navigate('history')} /><div className="wb-activity-summary"><div><strong>{memory ? activeDays : '—'}<small>天</small></strong><span>留下了工作与对话记录</span></div><div className="wb-legend"><span><i />语音输入</span><span><i />陪伴交流</span></div></div>
        <div className="wb-chart" role="img" aria-label={activity.length ? activity.map(day => `${day.day}：听写${day.dictationCount}次，陪伴${day.companionCount}条`).join('；') : '暂无使用记录'}>{activity.map((day, index) => <div className={`wb-chart-day ${index === 6 ? 'is-today' : ''}`} key={day.day} title={`${day.day} · 听写 ${day.dictationCount} 次 · 陪伴 ${day.companionCount} 条`}><span>{day.dictationCount + day.companionCount}</span><div className="wb-chart-track"><div className="wb-chart-stack" style={{ height: `${(day.dictationCount + day.companionCount) / maxActivity * 100}%` }}><i style={{ flex: day.companionCount }} /><i style={{ flex: day.dictationCount }} /></div></div><small>{index === 6 ? '今天' : `${Number(day.day.slice(5, 7))}/${Number(day.day.slice(8))}`}</small></div>)}</div>
        <div className="wb-panel-footer"><span>按已保存记录统计</span><button className="wb-text-link" onClick={() => navigate('voice')}>去语音输入<IconArrowUpRight size={15} /></button></div>
      </Card>
      <Card className="wb-memory"><PanelHeading icon={IconBrain} title="记忆正在积累" link="记忆管理" onClick={() => navigate('memory')} /><div className="wb-memory-totals"><div><strong>{number(memory?.completedJournals)}</strong><span>份日终总结</span></div><div><strong>{number(memory?.pendingSync)}</strong><span>份等待同步</span></div><StatusBadge tone={policy?.running ? 'demo' : 'neutral'}>{workbenchSchedule(policy, memory?.latestJournal)}</StatusBadge></div>
        <ol className="wb-pipeline"><li><span className="wb-step">{memory?.lastHourlyAt ? <IconCheck size={15} /> : '1'}</span><div><strong>每小时整理</strong><small>{!policy ? '状态待读取' : !policy.sourcesEnabled || !policy.hourlyEnabled ? '已暂停' : memory?.lastHourlyAt ? `最近整理 ${workbenchTime(memory.lastHourlyAt)}` : '已开启，等待新记录'}</small></div></li><li><span className="wb-step">2</span><div><strong>整天查漏与总结</strong><small>{memory?.latestJournal ? `${memory.latestJournal.day} · ${memory.latestJournal.status === 'completed' ? '已完成' : '待完成'}` : policy ? `${workbenchSchedule(policy)} · 完整回顾当天记录` : '状态待读取'}</small></div></li><li><span className="wb-step">3</span><div><strong>交给 KnowledgeOS</strong><small>{!knowledge ? '状态待读取' : !knowledge.syncEnabled ? '自动同步未开启' : memory?.pendingSync ? `${number(memory.pendingSync)} 份待提交 · 工作与个人分别保存` : memory?.acceptedSync ? `已受理 ${number(memory.acceptedSync)} 份 · ${workbenchTime(memory.lastAcceptedAt)}` : '等待日终生成工作、个人两份总结'}</small></div></li></ol>
        <div className="wb-panel-footer"><span>{memory?.pendingCandidates ? `${number(memory.pendingCandidates)} 条记忆候选待你确认` : '长期记忆经你确认后生效'}</span><button className="wb-text-link" onClick={() => navigate('memory')}>查看与整理<IconArrowUpRight size={15} /></button></div>
      </Card>
      <Card className="wb-scene"><PanelHeading icon={IconKeyboard} title="当前工作场景" link="按键配置" onClick={() => navigate('keymap')} /><div className="wb-scene-title"><span className="wb-scene-icon"><IconCode size={25} /></span><div><h3>{scene?.title || '场景待读取'}</h3><p>{scene ? `${number(scene.promptCount)} 条提示词 · 第 5–7 键跟随场景` : '连接桌面服务后显示当前选择'}</p></div></div><div className="wb-scene-keys">{(scene?.bindings || [5,6,7].map(key => ({ key, label: '待读取' }))).map(binding => <div key={binding.key}><small>KEY {binding.key}</small><strong title={binding.label}>{binding.label}</strong></div>)}</div><div className="wb-panel-footer"><span>在提示词或按键页按 Tab 切换</span><Button variant="soft" icon={IconSparkles} onClick={() => navigate('prompts')}>打开提示词</Button></div></Card>
      <Card className="wb-projects"><PanelHeading icon={IconCode} title="Codex 项目状态" link="任务联动" onClick={() => navigate('companion/agents')} /><div className="wb-project-list">{projects.length ? projects.slice(0, 3).map(project => <div className="wb-project" key={project.label}><div><strong title={project.label}>{project.label}</strong><small>{project.count} 个任务 · {workbenchTime(project.receivedAt)} 上报</small></div><StatusBadge tone={taskStates[project.state]?.[1]}>{taskStates[project.state]?.[0] || '未知'}</StatusBadge></div>) : <div className="wb-empty"><IconCode size={28} stroke={1.4} /><strong>尚未收到任务报告</strong><p>Codex 有任务上报后，项目状态会出现在这里。</p></div>}</div><div className="wb-panel-footer"><span>{projects.length > 3 ? `还有 ${projects.length - 3} 个项目 · ` : ''}以最近一次任务上报为准</span><span className="wb-mini-label">{state.runtime?.codexTasks?.receiver === 'listening' ? '状态接收已开启' : '接收服务待连接'}</span></div></Card>
    </div>
    <div className="wb-shortcuts"><button onClick={() => navigate('companion')}><IconMessageCircle2 size={22} /><div><strong>{state.settings.companionName || 'AI'} · AI 陪伴</strong><small>{companionStatus}</small></div><IconArrowUpRight size={17} /></button><button onClick={() => navigate('voice')}><IconMicrophone2 size={22} /><div><strong>语音输入</strong><small>说完再按一次，整理并写入</small></div><IconArrowUpRight size={17} /></button><button onClick={() => navigate('vocabulary')}><IconSparkles size={22} /><div><strong>我的词库</strong><small>{state.vocabulary.hotwords.length} 个热词 · {state.vocabulary.rules.length} 条替换规则</small></div><IconArrowUpRight size={17} /></button></div>
  </div>;
}
