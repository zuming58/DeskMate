import { useEffect, useRef } from 'react';
const drafts = new Set();
export function confirmNavigation() {
  return ![...drafts].some(read=>read()) || window.confirm('当前页面有未保存的修改。确定放弃修改并离开吗？');
}
export function useUnsavedChanges(dirty) {
  const latest=useRef(dirty); latest.current=dirty;
  useEffect(()=>{
    const read=()=>Boolean(latest.current); drafts.add(read);
    const unload=event=>{if(read()){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',unload);
    return ()=>{drafts.delete(read);window.removeEventListener('beforeunload',unload);};
  },[]);
}
