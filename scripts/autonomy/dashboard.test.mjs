import test from 'node:test';
import assert from 'node:assert/strict';
import {statusLabel,stageIndex,safeGithubURL,summarize,phaseLabel,blockerLabel,activityLabel} from './dashboard/view-model.mjs';
test('resource blockers supersede open phase and expired quota reset',()=>{
 assert.match(blockerLabel({lastReason:'disk-below-reserve'}),/مسدود/);
 assert.equal(phaseLabel({id:'p',status:'in-progress'},[{phase:'p',status:'needs-review'}],{lastReason:'disk-below-reserve'}),'متوقف تا رفع مانع');
 assert.equal(blockerLabel({lastReason:null}),null);
});
test('dashboard never treats merged/pending deployment as production complete',()=>{
 const result=summarize({engineering:[{id:'a',status:'awaiting-deploy'},{id:'b',status:'pending'}],research:[{status:'needs-evidence',claims:0}]});
 assert.equal(result.completed,0);assert.equal(result.total,2);assert.equal(result.claims,0);assert.equal(result.reviewedResearch,1);assert.equal(result.active.id,'a');
 assert.equal(stageIndex('awaiting-deploy'),6);assert.equal(stageIndex('completed'),7);
});
test('GitHub links allow only exact owned PR and run URLs',()=>{
 assert.equal(safeGithubURL('https://github.com/Rezz0722/cafe/pull/35'),'https://github.com/Rezz0722/cafe/pull/35');
 for(const bad of ['javascript:alert(1)','https://evil.invalid','https://github.com/Rezz0722/cafe/pull/35?token=secret','https://github.com/foreign/repo/pull/1']) assert.equal(safeGithubURL(bad),null);
});
test('waiting dependencies are shown queued and unknown values not invented',()=>{
 assert.equal(phaseLabel({id:'p',status:'in-progress'},[{phase:'p',status:'pending'}]),'در صف');
 assert.equal(statusLabel('made-up'),'وضعیت نامشخص');assert.equal(summarize(null).total,0);
 assert.equal(summarize({research:[{claims:-1},{claims:1.5},{claims:'3'}]}).claims,0);
});
test('activity wording does not claim cycle completion changed production',()=>{
 assert.match(activityLabel({type:'cycle-end'}),/به‌تنهایی/);
 assert.match(activityLabel({type:'engineering-empty'}),/کار کدنویسی باز باقی نمانده/);
 assert.match(activityLabel({type:'model-end',role:'writer'}),/نتیجه را از وضعیت کار بررسی کنید/);
});
