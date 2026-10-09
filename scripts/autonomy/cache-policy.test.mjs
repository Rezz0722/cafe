import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleCaches} from './cache-policy.mjs';
// The description and timestamp use Docker buildx's actual JSON formatting.
const row = {ID:'o871fco4gtsxt729fgkunefqr',Reclaimable:true,Shared:false,Mutable:true,CreatedAt:'2026-10-08 20:03:28.070265716 +0000 UTC',Description:String.raw`mount / from exec /bin/sh -c npm run postinstall && npm run prebuild && npm run build:next &&     printf '%s\n' "$NEXT_DEPLOYMENT_ID" > .next/DEPLOYMENT_ID`};
test('scope cache cleanup to exact old unshared KuCafe compilation records',()=>{
 const now=Date.parse('2026-10-08T21:00:00Z');
 assert.equal(eligibleCaches([row],now).length,1);
 for(const change of [{Shared:true},{Reclaimable:false},{Mutable:false},{ID:'../../unsafe'},{CreatedAt:'invalid'},{CreatedAt:'2026-10-08T20:59:59Z'},{Description:'npm ci'},{Description:'other project build'}]) assert.deepEqual(eligibleCaches([{...row,...change}],now),[]);
 assert.equal(eligibleCaches(Array(20).fill(row),now).length,8);
});
test('only unshared terminal descendants of the KuCafe deployment marker are reclaimed',()=>{
 const seed={...row,ID:'seedabcdefghijklmnopqrst',Mutable:false,Description:'[runtime 6/8] COPY --from=builder --chown=10001:10001 /app/.next/DEPLOYMENT_ID ./.next/DEPLOYMENT_ID',Shared:true};
 const leaf={...row,ID:'leafabcdefghijklmnopqrst',Mutable:false,Description:'COPY public',Parents:[seed.ID]};
 const unrelated={...leaf,ID:'otherabcdefghijklmnopqrs',Parents:[]};
 assert.deepEqual(eligibleCaches([seed,leaf,unrelated],Date.parse('2026-10-08T21:00Z')).map(r=>r.ID),[leaf.ID]);
 assert.deepEqual(eligibleCaches([seed,{...leaf,Shared:true}],Date.parse('2026-10-08T21:00Z')),[]);
 assert.deepEqual(eligibleCaches([{...seed,Description:'/app/.next/DEPLOYMENT_ID'},leaf],Date.parse('2026-10-08T21:00Z')),[]);
});
