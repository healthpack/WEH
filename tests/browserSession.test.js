import test from 'node:test';
import assert from 'node:assert/strict';
import {accountIdsFromPath,accountIdFromPath,accountPath,readSavedKey,saveValidatedKey,KEY_STORAGE_NAME} from '../src/browserSession.js';

const id='69a46f7413e0dcf990d09340';
const other='6a358233335ec368d750e704';

test('account links respect the deployment base and reject non-account paths',()=>{
  assert.equal(accountIdFromPath('/WEH/'+id,'/WEH/'),id);
  assert.equal(accountIdFromPath('/WEH/'+id.toUpperCase()+'/','/WEH/'),id);
  assert.equal(accountIdFromPath('/'+id),id);
  for(const path of ['/WEH/','/WEH/invalid','/WEH/'+id+'/extra','/OTHER/'+id])assert.equal(accountIdFromPath(path,'/WEH/'),null);
  assert.equal(accountPath(id.toUpperCase(),'/WEH/'),'/WEH/'+id);
  assert.throws(()=>accountPath('../private'),/valid account ID/);
});

test('two-account paths preserve order and deduplicate identities without accepting extra path segments',()=>{
  const path='/WEH/'+other+'/'+id;
  assert.deepEqual(accountIdsFromPath(path,'/WEH/'),[other,id]);
  assert.deepEqual(accountIdsFromPath(path.toUpperCase().replace('/WEH/','/WEH/')+'/','/WEH/'),[other,id]);
  assert.deepEqual(accountIdsFromPath('/'+id+'/'+other),[id,other]);
  assert.equal(accountPath([other.toUpperCase(),id],'/WEH/'),path);
  assert.deepEqual(accountIdsFromPath('/WEH/'+id+'/'+id,'/WEH/'),[id]);
  assert.equal(accountPath([id,id],'/WEH/'),'/WEH/'+id);
  assert.equal(accountIdFromPath(path,'/WEH/'),null);
  for(const value of ['/OTHER/'+other+'/'+id,path+'/extra',path+'/'+other,'/WEH/'+other+'/invalid'])assert.deepEqual(accountIdsFromPath(value,'/WEH/'),[]);
  for(const value of [[],[id,'invalid'],[id,other,id]])assert.throws(()=>accountPath(value,'/WEH/'),/valid account ID/);
});

test('browser storage remembers a key and degrades gracefully when unavailable',()=>{
  const previous=globalThis.window,storage=new Map();
  try {
    globalThis.window={localStorage:{getItem:name=>storage.get(name),setItem:(name,value)=>storage.set(name,value)}};
    assert.equal(readSavedKey(),'');assert.equal(saveValidatedKey('fixture-key'),true);
    assert.equal(storage.get(KEY_STORAGE_NAME),'fixture-key');assert.equal(readSavedKey(),'fixture-key');
    Object.defineProperty(globalThis.window,'localStorage',{get(){throw Error('Storage blocked');}});
    assert.equal(readSavedKey(),'');assert.equal(saveValidatedKey('fixture-key'),false);
  } finally {if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
