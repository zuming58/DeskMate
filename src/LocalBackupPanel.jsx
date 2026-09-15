import {useRef,useState} from 'react';
import {useAppStore} from './store/appStore.js';
const reasons={
  'backup-token-expired':'预览已过期，请重新选择备份并核对内容。',
  'backup-maintenance-active':'正在准备恢复并重启，请稍候。',
  'backup-busy':'已有备份任务正在执行，请稍后重试。',
  'backup-history-pending':'还有历史记录正在保存，请稍后再创建备份。',
  'backup-migration-incomplete':'请先到历史记录页完成本地迁移，再创建备份。',
  'backup-disk-full':'磁盘空间不足，原文件未被替换。请释放空间后重试。',
  'backup-extension-invalid':'请保留文件名末尾的 .deskmate-backup.json。',
  'backup-target-is-internal':'请保存在应用数据目录之外，避免与内部文件混淆。',
  'backup-bundle-too-large':'备份超过 256 MB，可先取消包含录音。',
  'backup-integrity-or-version':'备份内容损坏或版本不受支持，当前数据未改变。',
  'backup-data-or-storage-invalid':'数据校验或文件读写失败。原数据保留，请检查文件和磁盘后重试。'
};
export function LocalBackupPanel() {
  const {historyStatus,hasPendingHistory,exportConfig}=useAppStore();
  const [includeAudio,setIncludeAudio]=useState(false);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState(false);
  const [preview,setPreview]=useState(null);
  const [token,setToken]=useState('');
  const active=useRef(false);
  const supported=typeof globalThis.desktopBridge?.localBackup==='function';
  const run=async command=>{
    if(active.current)return;active.current=true;setBusy(command);setMessage('');setError(false);if(command!=='restore'){setPreview(null);setToken('');}
    try {
      if(['export','restore','checkpoint'].includes(command) && hasPendingHistory())throw new Error('backup-history-pending');
      const result=await globalThis.desktopBridge.localBackup({version:1,command,...(['export','checkpoint'].includes(command)?{includeAudio,config:JSON.parse(exportConfig()),pendingHistory:hasPendingHistory()}:command==='restore'?{token,pendingHistory:hasPendingHistory()}:{})});
      if(result?.canceled){setMessage('已取消，当前数据未改变。');return;}
      if(!result?.ok)throw new Error(result?.reason || 'backup-data-or-storage-invalid');
      if(['inspect','prepare','prepare-checkpoint'].includes(command)){setPreview(result.summary);setToken(result.token || '');setMessage('校验通过，以下仅为预览，未恢复或覆盖任何数据。');}
      else if(command==='checkpoint')setMessage('已建立并校验本机文字与配置快照；录音请通过勾选的导出备份保存。');
      else if(command==='restore')setMessage('恢复任务已准备，正在重启…');
      else setMessage(`备份已保存并校验：${result.history} 条语音历史、${result.recordings} 份录音，${(result.bytes/1024/1024).toFixed(2)} MB。`);
    } catch(e){setError(true);setMessage(reasons[e.message] || '备份操作未完成，原数据保留。请重试；仍失败时检查历史数据状态。');}
    finally{active.current=false;setBusy('');}
  };
  return <section className="local-backup-panel" aria-labelledby="local-backup-title">
    <h3 id="local-backup-title">本地数据备份</h3>
    <p>包含语音历史、个人提醒、词库、提示词与场景、本地记忆及来源、输入与陪伴设置。默认不含录音，不导出账号密钥、设备路径和已登记应用的启动路径。</p>
    <p>这是私人数据文件，不是脱敏诊断包。备份在后台生成，不暂停语音输入；备份开始后的新内容请在下次备份中保存。</p>
    <label className="local-backup-audio"><input type="checkbox" checked={includeAudio} disabled={Boolean(busy)} onChange={event=>setIncludeAudio(event.target.checked)} />包含受管原始录音（文件可能较大，备份上限 256 MB）</label>
    {!supported && <p role="status">请在新版 DeskMate 桌面端使用此功能。</p>}
    {supported && historyStatus?.phase!=='ready' && <p role="status">历史记录尚未完成迁移或存在保存异常，请先到历史记录页处理。</p>}
    <div className="local-backup-actions">
      <button className="btn btn-primary" disabled={!supported || Boolean(busy) || historyStatus?.phase!=='ready'} onClick={()=>run('export')}>{busy==='export'?'正在生成与校验…':'创建本地备份'}</button>
      <button className="btn btn-secondary" disabled={!supported || Boolean(busy)} onClick={()=>run('inspect')}>{busy==='inspect'?'正在校验备份…':'校验备份并预览'}</button>
      <button className="btn btn-secondary" disabled={!supported || Boolean(busy)} onClick={()=>run('prepare')}>{busy==='prepare'?'正在准备恢复…':'选择备份恢复'}</button>
      <button className="btn btn-secondary" disabled={!supported || Boolean(busy) || historyStatus?.phase!=='ready'} onClick={()=>run('checkpoint')}>保存本机恢复快照</button>
      <button className="btn btn-secondary" disabled={!supported || Boolean(busy)} onClick={()=>run('prepare-checkpoint')}>预览最近有效快照</button>
      {token && <button className="btn btn-primary" disabled={Boolean(busy)} onClick={()=>run('restore')}>恢复此备份并重启</button>}
    </div>
    {message && <p className={error?'local-backup-message is-error':'local-backup-message'} role={error?'alert':'status'}>{message}</p>}
    {preview && <dl className="local-backup-preview">
      <div><dt>备份时间</dt><dd>{new Date(preview.createdAt).toLocaleString()}</dd></div>
      <div><dt>语音历史 / 录音</dt><dd>{preview.history} 条 / {preview.recordings} 份</dd></div>
      <div><dt>原始记忆 / 记忆候选</dt><dd>{preview.turns} 条 / {preview.memories} 条</dd></div>
      <div><dt>日终总结</dt><dd>{preview.journals} 天</dd></div>
      <div><dt>个人提醒</dt><dd>{preview.reminders || 0} 条</dd></div>
      <div><dt>个人提示词 / 场景</dt><dd>{preview.prompts} 条 / {preview.scenes} 个</dd></div>
    </dl>}
    <p className="local-backup-footnote">恢复会替换当前数据，请先备份需要保留的新内容。预览有效期 10 分钟；确认后重启，失败时回滚。恢复后请重新检查应用绑定、语音服务及自动整理设置；旧日记不会自动重发。启用自动清理后，内部回滚副本保留 7 天，本机文字快照按文字保留天数到期；导出的备份由你自行保管。</p>
  </section>;
}
