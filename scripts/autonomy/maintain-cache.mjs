import {statfsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {eligibleCaches} from './cache-policy.mjs';
function run(args) {
  const r = spawnSync('docker', args, {encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
  if (r.error || r.status !== 0) throw Error('Scoped Docker maintenance failed');
  return r.stdout;
}
function free() { const s = statfsSync('/'); return Number(s.bavail)*Number(s.bsize); }
if (free() < 4*1024**3) {
  // Fail closed if the default builder does not belong to the local daemon.
  const endpoint = run(['context','inspect','--format','{{.Endpoints.docker.Host}}']).trim();
  if (endpoint !== 'unix:///var/run/docker.sock') throw Error('Non-local Docker context');
  for (let attempt=0;attempt<32;attempt++) {
    if (free() >= 4*1024**3) break;
    // Re-read immediately before deletion; Docker refuses records currently in use.
    const current = run(['buildx','du','--format','{{json .}}']).trim().split('\n').filter(Boolean).map(JSON.parse);
    const row = eligibleCaches(current)[0];
    if (!row) break;
    run(['buildx','prune','--force','--filter',`id=${row.ID}`]);
    console.log(`Removed reproducible KuCafe build cache ${row.ID}`);
  }
}
console.log(`KuCafe disk available: ${free()} bytes; images/media/backups untouched`);
