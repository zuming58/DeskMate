import { useCallback, useEffect, useState } from 'react';
import { voiceAdapters } from './adapters/voiceAdapters.js';
import { shortcutDisplay, shortcutFromKeyboardEvent } from './domain/shortcutCapture.js';
import { Button } from './ui.jsx';

export function ShortcutRecorder({ value, onConfirm, global = false, allowSingle = false }) {
  const [capturing, setCapturing] = useState(false);
  const [candidate, setCandidate] = useState('');
  const [message, setMessage] = useState('');
  const stopCapture = useCallback(() => {
    setCapturing(false);
    setCandidate('');
    setMessage('');
    if (global) voiceAdapters.desktop.setShortcutCapture(false).catch(() => {});
  }, [global]);
  const startCapture = async () => {
    setMessage('');
    setCandidate('');
    if (global) await voiceAdapters.desktop.setShortcutCapture(true);
    setCapturing(true);
  };
  useEffect(() => {
    if (!capturing) return undefined;
    const capture = event => {
      event.preventDefault();
      event.stopPropagation();
      if (!allowSingle && event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) { stopCapture(); return; }
      const result = shortcutFromKeyboardEvent(event, { allowSingle });
      if (result.error) { setCandidate(''); setMessage(result.error); }
      else if (result.shortcut) { setCandidate(result.shortcut); setMessage('请确认是否使用这个快捷键'); }
      else { setCandidate(''); setMessage(result.display ? `已按下 ${result.display}，请继续按一个字母、数字或功能键` : '请按下组合键'); }
    };
    window.addEventListener('keydown', capture, true);
    return () => window.removeEventListener('keydown', capture, true);
  }, [allowSingle, capturing, stopCapture]);
  useEffect(() => () => { if (global) voiceAdapters.desktop.setShortcutCapture(false).catch(() => {}); }, [global]);
  const confirm = async () => {
    if (!candidate) return;
    try { await onConfirm(candidate); stopCapture(); }
    catch (error) { setMessage(error.message || '快捷键无法注册'); }
  };
  return <div className="shortcut-recorder">
    <button type="button" className={`shortcut-recorder__field ${capturing ? 'is-capturing' : ''}`} onClick={startCapture}>{capturing ? shortcutDisplay(candidate) || (allowSingle ? '请按下单键或组合键…' : '请按下新的组合键…') : shortcutDisplay(value) || '点击录制快捷键'}</button>
    {capturing && <div className="shortcut-recorder__confirm"><small>{message || (allowSingle ? '请按下单键或组合键；使用取消按钮退出' : '请同时按下修饰键和一个按键；Esc 取消')}</small><div><Button variant="ghost" onClick={stopCapture}>取消</Button><Button variant="primary" disabled={!candidate} onClick={confirm}>确认</Button></div></div>}
  </div>;
}
