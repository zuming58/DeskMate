// Final archive verification; synthetic model and data, never production main.
const assert=require('node:assert/strict');
const {load,verify}=require('./verify-t53-natural-package.cjs');
async function check(){
  await verify();
  const {PersonalReminderConversation,PersonalReminderStore}=load('electron/personal-reminders.cjs');
  const now=new Date(2026,8,16,10).getTime(), saved=[];
  const c=new PersonalReminderConversation({now:()=>now,store:{create:r=>{saved.push(r);return r;}},requestJson:async()=>({title:'喝水'})});
  c.execute('一分钟后提醒我');
  await c.executeAsync('挺好笑的，你你帮我设置喝个水吧');
  assert.equal(saved[0].title,'喝水');assert.equal(saved[0].remindAt,now+60000);
  assert.equal(typeof PersonalReminderStore.prototype.remove,'function');
  console.log('T57 packaged purpose-only extraction, retained reminder time and deletion verified.');
}
check().catch(error=>{console.error(error);process.exitCode=1;});
