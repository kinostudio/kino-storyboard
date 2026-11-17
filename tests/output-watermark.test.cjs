const {test}=require('node:test');
const assert=require('node:assert/strict');
const bridge=require('../dist/project-bridge.js');
const schema=require('../dist/project-schema.js');
const base=()=>bridge.makeEmptyProject({projectId:'watermark-test',title:'Watermark',now:'2026-11-17T00:00:00.000Z'});
const mark={enabled:true,type:'text',text:'Review <private>',image:'',color:'#24334e',opacity:15,size:40,x:50,y:50,rotation:-30};
test('old projects without watermark remain valid; watermark survives unrelated preference edits',()=>{
 const project=base();
 assert.equal(project.outputPreferences.watermark,undefined);
 const next=bridge.applyCommand(project,'updateOutputPreferences',[{watermark:mark}]).project;
 assert.deepEqual(next.outputPreferences.watermark,mark);
 const updated=bridge.applyCommand(next,'updateOutputPreferences',[{orientation:'portrait'}]).project;
 assert.deepEqual(updated.outputPreferences.watermark,mark);
});
test('watermark rejects invalid geometry, remote/SVG images and oversized PNG headers',()=>{
 for(const patch of [{opacity:101},{size:0},{rotation:181},{x:NaN},{enabled:'yes'},{color:'red'},{text:'x'.repeat(201)},{image:'https://example.com/logo.png'},{image:'data:image/svg+xml;base64,PHN2Zz4='}]) {
  const project=base();project.outputPreferences.watermark={...mark,...patch};
  assert.throws(()=>schema.validateProject(project),error=>error.code==='INVALID_WATERMARK');
 }
 const bytes=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a0000000d49484452','hex').copy(bytes);
 bytes.writeUInt32BE(50000,16);bytes.writeUInt32BE(1,20);
 const project=base();project.outputPreferences.watermark={...mark,image:'data:image/png;base64,'+bytes.toString('base64')};
 assert.throws(()=>schema.validateProject(project),error=>error.code==='INVALID_WATERMARK');
});
