const assert=require('node:assert/strict');
const {load,verify}=require('./verify-t53-natural-package.cjs');
async function check(){
  await verify();
  const {parsePersonalReminderIntent:parse,formatPersonalReminderAnnouncement:format}=load('electron/personal-reminders.cjs');
  const now=new Date(2026,8,15,10).getTime();
  const reminder=parse('一分钟后提醒，嗯，提醒我一下喝水',{now});
  assert.equal(reminder.title,'喝水');assert.equal(reminder.remindAt,now+60000);
  assert.equal(format(reminder,{ownerName:'朋友'}),'朋友，喝水时间到了。');
  assert.equal(parse('一分钟后提醒我看一下合同',{now}).title,'看一下合同');
  assert.equal(format({title:'嗯 一下 喝水'}),'喝水时间到了。');
  console.log('T56 final-ASAR verified: clean purpose, preserved action, configured address, natural speech and legacy read-only cleanup.');
}
check().catch(error=>{console.error(error);process.exitCode=1;});
