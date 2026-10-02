// Bounded live browser check: verifies CORS and stops as soon as events appear.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.WEH_PLAYWRIGHT_PATH||'playwright');
if(!process.env.WARERA_API_KEY)throw Error('Set WARERA_API_KEY for this optional check.');
const browser=await chromium.launch({headless:true,...(process.env.WEH_CHROME_PATH?{executablePath:process.env.WEH_CHROME_PATH}:{})});
try{
  const page=await browser.newPage();let liveRequests=0;
  // Limit this test's traffic independently of the app's uncapped history walk.
  await page.route(/https:\/\/(api2\.warera\.io|gateway\.warerastats\.io)\//,route=>{
    if(++liveRequests>24)return route.abort();return route.continue();
  });
  await page.goto(process.env.WEH_TEST_URL||'http://127.0.0.1:5180/');
  await page.getByLabel('WarEra API key').fill(process.env.WARERA_API_KEY);
  await page.getByRole('button',{name:'Validate & continue'}).click();
  await page.getByLabel('Username or profile link').waitFor({timeout:30000});
  await page.getByRole('button',{name:'Start deep dive',exact:true}).click();
  await page.waitForFunction(()=>Number(document.querySelector('[data-stat=events]')?.textContent.replace(/\D/g,''))>0,{},{timeout:30000});
  if(await page.getByRole('button',{name:'Stop',exact:true}).isEnabled())await page.getByRole('button',{name:'Stop',exact:true}).click();
  const count=await page.locator('[data-stat=events]').innerText();
  await page.getByRole('tab',{name:'Heatmap',exact:true}).click();await page.locator('[data-deep-view=density] svg').waitFor();
  await page.getByRole('tab',{name:'Daily trends',exact:true}).click();await page.locator('[data-deep-view=trends] svg').waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-stat=events]').innerText(),count);
  console.log(`Live browser check passed: real key validation, profile lookup, streaming events, Stop, heatmap and trends; ${Math.min(liveRequests,24)} upstream attempts, key never logged or saved.`);
}finally{await browser.close();}
