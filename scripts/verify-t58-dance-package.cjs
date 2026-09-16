const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const asar=require('@electron/asar');
const release=process.argv[2]||'release-t58';
assert(/^release(?:-[a-z0-9-]+)?$/.test(release));
const archive=path.resolve(__dirname,'..',release,'win-unpacked/resources/app.asar');
const main=asar.extractFile(archive,'electron/main.cjs').toString();
assert(/t58-dance-music-lifetime|t59-vocabulary-ui-polish/.test(main));
let finish;
const pending=new Promise(resolve=>finish=resolve),commands=[];
const context=vm.createContext({Date,activeDanceMusicRequestId:'',danceMusicSequence:0,
  localDanceMusicStore:{status:()=>({configured:false}),notePlayback(){}},
  sendToMain:(channel,value)=>{if(channel==='dance-music-command')commands.push(value);},xiaozhiHardwareEnabled:()=>true,
  choreographyService:{executePreset:()=>pending},motionPresetService:{}});
vm.runInContext(main.slice(main.indexOf('function emitDanceMusicStatus()'),main.indexOf('function createAudioSetupWindow()')),context);
async function check(){
  const operation=context.runMotionPreset({preset:'dance',repeat:3,source:'UI'});
  assert.equal(commands[0].loop,true);assert.equal(commands.length,1);
  finish({ok:true,endpointReportedComplete:true});await operation;
  assert.equal(commands.at(-1).type,'stop');assert.equal(commands.at(-1).requestId,commands[0].requestId);
  context.startDanceMusic({force:true});assert.equal(commands.at(-1).loop,false);
  console.log('T58/T59 final-ASAR motion-owned dance loop, completion stop and one-shot preview passed. No hardware invoked.');
}
check().catch(error=>{console.error(error);process.exitCode=1;});
