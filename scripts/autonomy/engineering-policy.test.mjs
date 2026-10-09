import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePatch, selectTask, ciDecision, canMerge, canCarryReview, isControllerOnlyComparison } from './engineering-policy.mjs';
const task = {paths:['src/core/example.ts','src/core/example.test.ts'],requiredTests:['src/core/example.test.ts']};
const patch = {summary:'Pure change', files:[{path:task.paths[0],content:'export const x = 2\n'},{path:task.paths[1],content:'test("regression", () => assert.equal(x, 2))\n'}]};
test('accepts small scoped code with regression test',()=>assert.equal(validatePatch(task,patch,{}).length,64));
test('independent controller upgrade rejects application changes or uncertain comparisons',()=>{
 const diff={status:'ahead',total_commits:3,files:[{filename:'scripts/autonomy/dashboard/.htaccess'},{filename:'docs/KUCAFE_AUTONOMY_FA.md'},{filename:'docs/KUCAFE_AUTONOMY_V3_EXECUTION_FA.md'}]};
 assert.equal(isControllerOnlyComparison(diff),true);
 for(const invalid of [{...diff,status:'diverged'},{...diff,total_commits:21},{...diff,files:Array(300).fill(diff.files[0])},{...diff,files:[{filename:'src/app/page.tsx'}]},{...diff,files:[{filename:'scripts/autonomy/../../src/auth.ts'}]},null]) assert.equal(isControllerOnlyComparison(invalid),false);
});
test('review can carry across unrelated base changes only with identical full source context',()=>{
 const entry={review:{accepted:true},patchHash:'exact',reviewedHash:'exact'};
 const context={'source.ts':'original','context.ts':'dependency'};
 assert.equal(canCarryReview(entry,context,{...context}),true);
 assert.equal(canCarryReview(entry,context,{...context,'context.ts':'changed'}),false);
 assert.equal(canCarryReview({...entry,reviewedHash:'other'},context,context),false);
 assert.equal(canCarryReview(entry,null,context),false);
});
test('rejects wholesale removal of existing source',()=>assert.throws(()=>validatePatch(task,patch,{[task.paths[0]]:Array.from({length:300},(_,i)=>`original line ${i}`).join('\n')})));
test('rejects traversals, duplicate files, infrastructure, secrets and unsafe operations',()=>{
 for(const file of [{path:'../../etc/passwd',content:'x'},{path:'.github/workflows/ci.yml',content:'x'},{path:task.paths[0],content:'process.env.DATABASE_URL'},{path:task.paths[0],content:'fetch("https://evil.invalid")'}]) assert.throws(()=>validatePatch(task,{...patch,files:[file,patch.files[1]]},{}));
 assert.throws(()=>validatePatch(task,{...patch,files:[patch.files[0]]},{}));
 assert.throws(()=>validatePatch(task,{...patch,files:[patch.files[1],patch.files[1]]},{}));
});
test('phase dependencies advance only after production completion, not merge',()=>{
 const roadmap={tasks:[{id:'a',dependsOn:[]},{id:'b',dependsOn:['a']}]};
 assert.equal(selectTask(roadmap,{tasks:{a:{status:'awaiting-deploy'}}}).id,'a');
 assert.equal(selectTask(roadmap,{tasks:{a:{status:'completed'}}}).id,'b');
 assert.equal(selectTask(roadmap,{tasks:{a:{status:'blocked'}}}),null);
});
test('CI no checks, pending and skipped are not success',()=>{
 assert.equal(ciDecision([]),'waiting');
 assert.equal(ciDecision([{name:'verify',status:'COMPLETED',conclusion:'SKIPPED'}]),'waiting');
 assert.equal(ciDecision([{name:'verify',status:'COMPLETED',conclusion:'FAILURE'}]),'failed');
 assert.equal(ciDecision([{name:'verify',status:'COMPLETED',conclusion:'SUCCESS'}]),'passed');
});
test('normal merge gate requires identical reviewed head and disk reserve',()=>{
 const e={review:{accepted:true},patchHash:'same',reviewedHash:'same',headSha:'head'};
 const p={headRefOid:'head',baseRefName:'production',state:'OPEN',mergeStateStatus:'CLEAN',statusCheckRollup:[{name:'verify',status:'COMPLETED',conclusion:'SUCCESS'}]};
 assert.equal(canMerge(e,p,3*1024**3),true);
 assert.equal(canMerge(e,{...p,headRefOid:'foreign'},3*1024**3),false);
 assert.equal(canMerge(e,p,2*1024**3),false);
 assert.equal(canMerge({...e,reviewedHash:'different'},p,3*1024**3),false);
});
