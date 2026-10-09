/** Independent bounded repair of a false-active self-hosted runner. Never kills a job. */
import { existsSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { recoveryDecision } from './runner-watchdog-policy.mjs';

const unit = 'actions.runner.Rezz0722-cafe.kucafe-production-server-45-159-115-116.service';
const stateFile = '/var/lib/kucafe-autonomy/runner-watchdog.json';
function call(command, args, timeout = 15000) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout, maxBuffer: 200000 });
  if (result.error || result.status !== 0) throw Error(`${command} unavailable`);
  return result.stdout.trim();
}
function save(value) {
  writeFileSync(stateFile + '.tmp', JSON.stringify(value) + '\n', { mode: 0o600 });
  chmodSync(stateFile + '.tmp', 0o600); renameSync(stateFile + '.tmp', stateFile);
}
function status() {
  const payload = JSON.parse(call('gh', ['api', 'repos/Rezz0722/cafe/actions/runners']));
  const runner = payload?.runners?.find(row => row?.name === 'kucafe-production-server-45-159-115-116');
  return runner ? { status: runner.status, busy: runner.busy === true } : null;
}
const old = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { offlineCount: 0, restartsToday: 0, lastRestartAt: 0, day: '' };
let runner;
try { runner = status(); } catch { console.log('GitHub runner status unavailable; no recovery action'); process.exit(0); }
const worker = spawnSync('pgrep', ['-f', '^/opt/actions-runner-kucafe/bin/Runner.Worker'], { encoding: 'utf8', timeout: 5000 });
const workerActive = worker.status === 0;
// A shell wrapper checks both deployment locks before this point. Recheck the
// local worker immediately before considering a restart; GitHub busy wins too.
const decision = recoveryDecision({ runner, workerActive, deployActive: false, state: old });
if (decision.action !== 'unknown' && decision.action !== 'busy-skip') save(decision.next);
if (decision.action === 'restart') {
  try { call('systemctl', ['restart', unit], 30000); console.log('Offline idle runner restarted after two observations'); }
  catch { console.log('Runner restart failed; bounded cooldown retained'); process.exitCode = 1; }
} else console.log(`Runner watchdog: ${decision.action}`);
