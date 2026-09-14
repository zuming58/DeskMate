const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktopBridge',{
  promptWorkbench:value=>ipcRenderer.invoke('probe:prompts',value),
  onPromptWorkbenchState:listener=>{const handle=(_e,value)=>listener(value);ipcRenderer.on('probe:state',handle);return ()=>ipcRenderer.removeListener('probe:state',handle);},
  getMemoryStatus:async()=>({ready:true,turns:0,sourceCounts:{},pendingCandidates:0,longTermMemories:0}),listMemories:async()=>[],getKnowledgeBaseStatus:async()=>({}),getMemoryJournalStatus:async()=>({active:{day:'2099-01-01'}}),
  getMemoryPolicy:async()=>({version:3,enabledSources:['companion'],schedule:'daily',dailyTime:'23:30',hourlyEnabled:true,audioRetentionDays:7,rawRetentionDays:20,lastResults:{}}),
  getKnowledgeOsStatus:async()=>({configured:false,credentialId:'',projectId:null,readEnabled:false,syncEnabled:false,sensitivity:'private'}),
  getLocalRetentionStatus:async()=>({ok:true,enabled:false,pending:0,lastRunAt:null,lastResult:null})
});
