import test from 'node:test';
import assert from 'node:assert/strict';
import { reloadDeviceData } from '../src/lib/workspace-events.ts';
test('cloud edits survive auth refresh, other tabs and device backup events',()=>{
 for(const key of ['algopilot.v1','sb-project-auth-token',null])assert.equal(reloadDeviceData(true,key,'algopilot.v1'),false);
});
test('device workspace reloads only its own backup changes or a storage clear',()=>{
 assert.equal(reloadDeviceData(false,'algopilot.v1','algopilot.v1'),true);
 assert.equal(reloadDeviceData(false,null,'algopilot.v1'),true);
 assert.equal(reloadDeviceData(false,'sb-project-auth-token','algopilot.v1'),false);
});
