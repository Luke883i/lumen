import test from 'node:test';
import assert from 'node:assert/strict';
import {createInboxWatcher} from '../public/notification-watch.js';
test('foreground watcher does not alert for old unread history after login',()=>{
 const watch=createInboxWatcher();
 let x=watch.observe('staff-1',[{id:'old',read_at:null}]);
 assert.deepEqual(x,{unread:1,arrivals:0});
 x=watch.observe('staff-1',[{id:'old',read_at:null},{id:'new',read_at:null}]);
 assert.deepEqual(x,{unread:2,arrivals:1});
 assert.deepEqual(watch.observe('staff-1',[{id:'old',read_at:null},{id:'new',read_at:null}]),{unread:2,arrivals:0});
 assert.deepEqual(watch.observe('staff-1',[{id:'new',read_at:new Date().toISOString()}]),{unread:0,arrivals:0});
});
test('identity switches cannot show old inbox alerts',()=>{
 const watch=createInboxWatcher();
 watch.observe('faculty-1',[{id:'faculty-msg',read_at:null}]);
 assert.deepEqual(watch.observe('staff-1',[{id:'staff-msg',read_at:null}]),{unread:1,arrivals:0});
 assert.deepEqual(watch.observe('staff-1',[{id:'staff-msg',read_at:null},{id:'next',read_at:null}]),{unread:2,arrivals:1});
 watch.reset();
 assert.deepEqual(watch.observe('faculty-1',[{id:'faculty-msg',read_at:null}]),{unread:1,arrivals:0});
});
