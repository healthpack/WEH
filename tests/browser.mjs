// Optional browser integration check using a host-supplied Playwright runtime.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {TYPES,EXAMPLE_PROFILE} from '../src/warera.js';
import {KEY_STORAGE_NAME} from '../src/browserSession.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.WEH_PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.WEH_CHROME_PATH?{executablePath:process.env.WEH_CHROME_PATH}:{})});
const output=new URL('../test-results/',import.meta.url);
await fs.mkdir(output,{recursive:true});
const context=await browser.newContext({viewport:{width:1440,height:1050}});
const errors=[];
context.on('page',page=>{
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
});
const page=await context.newPage();
const baseURL=process.env.WEH_TEST_URL||'http://127.0.0.1:5180/';
let mode='slow',calls=0,validations=0;
const id=EXAMPLE_PROFILE.split('/').at(-1),otherId='69a46f7413e0dcf990d09341';
const wage=(i,userId)=>({_id:`${userId}-${i}`,sellerId:userId,createdAt:new Date(Date.UTC(2025,0,1)+i*360000).toISOString()});
await context.route('https://fonts.googleapis.com/**',route=>route.abort());
await context.route(/https:\/\/(api2\.warera\.io|gateway\.warerastats\.io)\//,async route=>{
  const request=route.request(),url=new URL(request.url()),endpoint=url.pathname.split('/').at(-1);
  const official=url.hostname==='api2.warera.io';
  const input=official?JSON.parse(url.searchParams.get('input'))[0]:request.postDataJSON();
  const reply=async body=>{try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(official?[{result:{data:body}}]:{result:{data:body}})});}catch{/* request aborted by Stop */}};
  if(input.limit===1)validations++;
  if(request.headers()['x-api-key']==='invalid')return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify([{error:{message:'Unauthorized',data:{code:'UNAUTHORIZED'}}}])});
  if(endpoint==='user.getUserLite')return reply({username:input.userId===id?'Example explorer':'Second explorer'});
  if(endpoint==='search.searchAnything')return reply({userIds:[id,otherId]});
  if(input.limit===1)return reply({items:[wage(0,id)]});
  assert.equal(endpoint,'transaction.getPaginatedTransactions');calls++;
  if(mode==='slow'&&!input.cursor)await new Promise(resolve=>setTimeout(resolve,500));
  const sentTime=new Date(Date.UTC(2025,0,24,18)).toISOString(),saleTime=new Date(Date.UTC(2025,1,28)).toISOString();
  if(input.transactionType==='articleTip')return reply({items:[
    {_id:'sent-tip',buyerId:input.userId,sellerId:'other',createdAt:sentTime},
    ...Array.from({length:20},(_,i)=>({_id:'received-tip-'+i,buyerId:'other',sellerId:input.userId,createdAt:saleTime})),
  ]});
  if(input.transactionType==='itemMarket')return reply({items:[
    {_id:'own-listing',sellerId:input.userId,buyerId:'other',item:{_id:'equipment-one'},offerCreatedAt:sentTime,createdAt:saleTime},
    {_id:'own-listing-repeat',sellerId:input.userId,buyerId:'another',item:{_id:'equipment-one'},offerCreatedAt:sentTime,createdAt:saleTime},
    {_id:'purchase',sellerId:'other',buyerId:input.userId,offerCreatedAt:saleTime,createdAt:saleTime},
    {_id:'unknown-listing-time',sellerId:input.userId,buyerId:'other',createdAt:saleTime},
  ]});
  if(input.transactionType==='trading')return reply({items:[
    {_id:'resource-sell',sellerId:input.userId,buyerId:'other',offerCreatedAt:saleTime,createdAt:saleTime},
    {_id:'resource-buy',sellerId:'other',buyerId:input.userId,offerCreatedAt:saleTime,createdAt:saleTime},
  ]});
  if(input.transactionType==='battleLoot')return reply({items:[
    {_id:'equipment-award',buyerId:input.userId,itemCode:'chest3',createdAt:saleTime},
    {_id:'foreign-case',buyerId:'other',itemCode:'case1',createdAt:saleTime},
    ...(input.userId===otherId?[{_id:'wooden-drop',buyerId:input.userId,itemCode:'woodenCase',createdAt:new Date(Date.UTC(2025,0,24,16)).toISOString()}]:[]),
  ]});
  if(input.transactionType==='craftItem')return reply({items:Array.from({length:10},(_,i)=>({...wage(i,input.userId),_id:'craft-'+i,createdAt:new Date(Date.UTC(2025,0,24,12)+i*60000).toISOString()}))});
  if(input.transactionType!=='wage')return reply({items:[]});
  const cursor=Number(input.cursor||0);
  if(mode==='slow'&&cursor>0)await new Promise(resolve=>setTimeout(resolve,1000));
  const items=Array.from({length:100},(_,i)=>wage(cursor*100+i,input.userId));
  return reply({items,nextCursor:mode==='slow'?String(cursor+1):cursor<54?String(cursor+1):null});
});
try{
  await page.goto(baseURL);
  assert.match(await page.locator('.brand').innerText(),/WAR ERA HISTORY/);
  assert.equal(await page.getByLabel('WarEra API key').getAttribute('placeholder'),'wae_768abc...');
  assert.equal(await page.getByLabel('WarEra API key').inputValue(),'');
  assert.equal(await page.getByRole('heading',{level:2}).innerText(),'War Era account explorer');
  assert.match(await page.locator('.key-explainer').innerText(),/WAR ERA settings.*blue CREATE TOKEN.*copy the key/);
  await page.screenshot({path:new URL('01-key-gate.png',output).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  await page.getByLabel('WarEra API key').fill('invalid');
  await page.getByRole('button',{name:'Validate & continue'}).click();
  await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/rejected this key/);
  await page.getByLabel('WarEra API key').fill('fixture-key');
  await page.getByRole('button',{name:'Validate & continue'}).click();
  await page.getByLabel('Username or profile link').waitFor();
  assert.equal(await page.getByLabel('Username or profile link').inputValue(),EXAMPLE_PROFILE);
  await page.screenshot({path:new URL('02-profile-search.png',output).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  await page.getByRole('button',{name:'Start deep dive',exact:true}).click();
  await page.getByTestId('graph-loading').waitFor();
  assert.match(await page.getByTestId('graph-loading').innerText(),/Waiting for the first transaction pages/);
  await page.screenshot({path:new URL('05-loading.png',output).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  await page.waitForFunction(()=>Number(document.querySelector('[data-stat=events]')?.textContent.replace(/\D/g,''))>=100);
  assert.equal(await page.getByRole('tab').count(),3);
  assert.deepEqual(await page.getByRole('tab').allTextContents(),['Fingerprint','Heatmap','Daily trends']);
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  const stopped=await page.locator('[data-stat=events]').innerText(),before=calls;
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('[data-stat=events]').innerText(),stopped);assert.equal(calls,before);
  await page.getByRole('tab',{name:'Heatmap',exact:true}).click();await page.locator('[data-deep-view=density] svg').waitFor();
  assert.equal(await page.locator('[data-deep-view=density] pattern').count(),0);
  await page.getByRole('tab',{name:'Daily trends',exact:true}).click();await page.locator('[data-deep-view=trends] svg').waitFor();
  assert.equal(await page.locator('[data-deep-view=trends] pattern').count(),0);
  await page.getByRole('button',{name:'Search new user',exact:true}).click();
  await page.getByLabel('Username or profile link').fill('Example');
  await page.getByRole('button',{name:'Start deep dive',exact:true}).click();
  await page.getByRole('button',{name:/Second explorer/}).waitFor();
  mode='complete';await page.getByRole('button',{name:/Second explorer/}).click();
  await page.waitForFunction(()=>document.querySelector('.status')?.textContent==='History complete');
  assert.equal((await page.locator('[data-stat=events]').innerText()).replace(/\D/g,''),'5513');
  assert.match(await page.locator('.account-name').innerText(),/Second explorer/);
  assert.equal(await page.getByRole('button',{name:'Stop',exact:true}).isDisabled(),true);
  assert.equal(await page.getByTestId('graph-loading').count(),0);
  assert.equal(await page.locator('input[type=date]').count(),0);
  assert.equal(await page.getByLabel('Market side').count(),0);
  assert.equal(await page.getByText('Relative to each account’s peak',{exact:true}).count(),0);
  assert.equal(await page.getByText('ONE ACCOUNT. ALL AVAILABLE HISTORY.',{exact:true}).count(),0);
  assert.match(await page.getByRole('heading',{level:1}).innerText(),/^View the actions of a War Era account over time\.$/);
  assert.equal(page.url(),baseURL+otherId);
  assert.match(await page.getByRole('button',{name:'Equipment market',exact:true}).getAttribute('title'),/Only this account’s equipment listings.*Purchases and sale completion times are excluded/);
  assert.match(await page.getByRole('button',{name:'Article tips',exact:true}).getAttribute('title'),/Received tips are excluded from all charts/);
  assert.match(await page.getByRole('button',{name:'Resource offers',exact:true}).getAttribute('title'),/Excluded from all charts/);
  assert.match(await page.getByRole('button',{name:'Battle cases',exact:true}).getAttribute('title'),/Equipment awards are excluded.*not individual drop times/);
  await page.getByRole('button',{name:'Resource offers',exact:true}).click({modifiers:['Shift']});
  for(const name of ['Fingerprint','Heatmap','Daily trends']) {
    await page.getByRole('tab',{name,exact:true}).click();
    assert.match(await page.locator('.chart-content').innerText(),/Resource listing history is unavailable.*Historical trades do not identify/s);
  }
  await page.screenshot({path:new URL('06-resource-history.png',output).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  await page.getByRole('button',{name:'All actions',exact:true}).click();
  await page.getByRole('tab',{name:'Fingerprint',exact:true}).click();
  assert.doesNotMatch(await page.locator('.chart-content').innerText(),/Equipment sellers use listing time/);
  const canvas=page.getByRole('img',{name:'Activity fingerprint by date and hour in UTC'});
  const colors=async()=>canvas.evaluate(c=>{
    const bytes=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let green=0,gold=0;
    for(let i=0;i<bytes.length;i+=4){if(bytes[i+3]<100)continue;const [r,g,b]=bytes.slice(i,i+3);if(r>55&&r<72&&g>198&&g<220&&b>150&&b<180)green++;if(r>240&&g>190&&g<225&&b<95)gold++;}
    return {green,gold};
  });
  assert.deepEqual(await colors(),{green:0,gold:0});
  await page.getByRole('button',{name:'Color by type',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.colorMode==='color');
  assert.ok((await colors()).green>0);assert.ok((await colors()).gold>0);
  await page.getByRole('button',{name:'Work',exact:true}).click({modifiers:['Shift']});
  assert.equal(await page.locator('.type-filters button[aria-pressed=true]').count(),1);
  assert.equal(await page.locator('.type-filters button[aria-pressed=true]').innerText(),'Work');
  assert.equal((await colors()).gold,0);assert.ok((await colors()).green>0);
  await page.getByRole('button',{name:'All actions',exact:true}).click();
  assert.equal(await page.locator('.type-filters button[aria-pressed=true]').count(),TYPES.length+1);
  await page.getByRole('button',{name:'Monochrome',exact:true}).click();
  assert.deepEqual(await colors(),{green:0,gold:0});
  await page.getByRole('button',{name:'Color by type',exact:true}).click();
  const beforeZone=await canvas.evaluate(c=>c.toDataURL());
  await page.getByLabel('Timezone',{exact:true}).selectOption('America/New_York');
  const localCanvas=page.getByRole('img',{name:'Activity fingerprint by date and hour in America/New_York'});
  await localCanvas.waitFor();assert.notEqual(await localCanvas.evaluate(c=>c.toDataURL()),beforeZone);
  assert.equal(await page.locator('.date-stat').innerText(),'2024-12-31');
  for(const name of ['Fingerprint','Heatmap','Daily trends']){
    await page.getByRole('tab',{name,exact:true}).click();
    if(name!=='Fingerprint')assert.equal(await page.locator('[data-deep-view]').getAttribute('data-timezone'),'America/New_York');
    if(name==='Heatmap'){
      assert.ok(await page.locator('[data-deep-view=density] rect[data-event-type=wage]').count()>0);
      assert.ok(await page.locator('[data-deep-view=density] rect[data-event-type=craftItem]').count()>0);
      assert.match(await page.locator('[data-deep-view=density] rect[data-event-type=wage] title').first().textContent(),/2024-12-31 · 19:00 America\/New_York/);
      assert.equal(await page.locator('[data-deep-view=density] rect[data-event-type=articleTip]').count(),1);
      assert.equal(await page.locator('[data-deep-view=density] rect[data-event-type=itemMarket]').count(),1);
      assert.equal(await page.locator('[data-deep-view=density] rect[data-event-type=trading]').count(),0);
      assert.equal(await page.locator('[data-deep-view=density] rect[data-event-type=battleLoot]').count(),1);
      assert.match(await page.locator('[data-deep-view=density] rect[data-event-type=battleLoot] title').textContent(),/2025-01-24 · 11:00.*1 Battle cases events/);
      assert.match(await page.locator('[data-deep-view=density] rect[data-event-type=articleTip] title').textContent(),/2025-01-24 · 13:00.*1 Article tips events/);
      assert.match(await page.locator('[data-deep-view=density] rect[data-event-type=itemMarket] title').textContent(),/2025-01-24 · 13:00.*1 Equipment market events/);
    }
    if(name==='Daily trends')assert.equal(await page.locator('[data-deep-view=trends] g[data-event-type]').count(),TYPES.length);
    await page.screenshot({path:new URL(`03-${name.replaceAll(' ','-').toLowerCase()}.png`,output).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  }
  await page.getByRole('tab',{name:'Fingerprint',exact:true}).click();
  assert.ok(await localCanvas.evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)));
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
  await page.screenshot({path:new URL('04-mobile.png',output).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.getByRole('tab',{name:'Heatmap',exact:true}).click();
  await page.getByRole('tab',{name:'Daily trends',exact:true}).click();
  await page.getByRole('button',{name:'Change API key',exact:true}).click();
  await page.getByLabel('WarEra API key').waitFor();
  assert.equal(await page.getByLabel('WarEra API key').inputValue(),'fixture-key');
  await page.getByLabel('WarEra API key').fill('invalid');
  await page.getByRole('button',{name:'Validate & continue'}).click();
  await page.getByRole('alert').waitFor();
  await page.getByRole('button',{name:'Keep previous key & go back',exact:true}).click();
  assert.equal((await page.locator('[data-stat=events]').innerText()).replace(/\D/g,''),'5513');
  await page.getByRole('button',{name:'Change API key',exact:true}).click();
  assert.equal(await page.getByLabel('WarEra API key').inputValue(),'fixture-key');
  await page.getByRole('button',{name:'Validate & continue'}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await page.evaluate(name=>localStorage.getItem(name),KEY_STORAGE_NAME),'fixture-key');
  assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),1);

  // Refresh restores and revalidates the saved key, then scans the linked account.
  const priorValidations=validations;
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('.status')?.textContent==='History complete');
  assert.ok(validations>priorValidations);assert.match(await page.locator('.account-name').innerText(),/Second explorer/);
  assert.equal((await page.locator('[data-stat=events]').innerText()).replace(/\D/g,''),'5513');
  assert.equal(await page.getByRole('dialog').count(),0);

  // Opening the site again in another tab of this browser also restores the key.
  const reopened=await context.newPage();await reopened.goto(baseURL);
  await reopened.getByLabel('Username or profile link').waitFor();
  assert.equal(await reopened.getByLabel('WarEra API key').count(),0);
  await reopened.close();

  await page.goBack();
  await page.waitForFunction(()=>document.querySelector('.status')?.textContent==='History complete'&&document.querySelector('.account-name')?.textContent.includes('Example explorer'));
  assert.equal(page.url(),baseURL+id);
  await page.goForward();
  await page.waitForFunction(()=>document.querySelector('.status')?.textContent==='History complete'&&document.querySelector('.account-name')?.textContent.includes('Second explorer'));

  // A first-time visitor's direct link waits for a key, then starts without a search click.
  await page.evaluate(name=>localStorage.removeItem(name),KEY_STORAGE_NAME);
  const beforeLinked=calls;
  await page.goto(baseURL+id);
  await page.getByLabel('WarEra API key').waitFor();
  assert.equal(calls,beforeLinked);
  await page.getByLabel('WarEra API key').fill('fixture-key');
  await page.getByRole('button',{name:'Validate & continue'}).click();
  await page.waitForFunction(()=>document.querySelector('.status')?.textContent==='History complete');
  assert.match(await page.locator('.account-name').innerText(),/Example explorer/);
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'Battle cases',exact:true}).click({modifiers:['Shift']});
  for(const name of ['Fingerprint','Heatmap','Daily trends']) {
    await page.getByRole('tab',{name,exact:true}).click();
    assert.match(await page.locator('.chart-content').innerText(),/No case-drop timestamps available.*Battle equipment awards are excluded/s);
  }
  await page.setViewportSize({width:1440,height:1050});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:new URL('07-battle-cases.png',output).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  await page.getByRole('button',{name:'All actions',exact:true}).click();

  // An expired saved key blocks the queued scan and can be replaced in place.
  await page.evaluate(name=>localStorage.setItem(name,'invalid'),KEY_STORAGE_NAME);
  const beforeExpired=calls;
  await page.reload();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(),/saved key could not be verified/);
  assert.equal(calls,beforeExpired);
  await page.getByLabel('WarEra API key').fill('fixture-key');
  await page.getByRole('button',{name:'Validate & continue'}).click();
  await page.waitForFunction(()=>document.querySelector('.status')?.textContent==='History complete');
  assert.equal(await page.evaluate(name=>localStorage.getItem(name),KEY_STORAGE_NAME),'fixture-key');
  // Expected network errors: mocked invalid keys, blocked fonts, Pages' route shell.
  assert.deepEqual(errors.filter(e=>!e.includes('401')&&!e.includes('404')&&!e.includes('net::ERR_FAILED')),[]);
  console.log('Browser checks passed: 5,513 own events including a wooden battle case; equipment award/foreign case exclusions, source-specific empty feedback in all three tabs, attribution, colors, timezone, Stop, mobile, saved keys and account links.');
}finally{await browser.close();}
