import { test, expect } from '@playwright/test';
import path from 'node:path';

// Simulated RFCOMM device only. These tests make no physical-device claims.
test.beforeEach(async ({ page }) => {
  if (process.env.OFFLINE_BROWSER_TESTS) {
    await page.route('http://127.0.0.1:8080/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      return route.fulfill({ path: path.resolve('dist', pathname === '/' ? 'index.html' : pathname.slice(1)) });
    });
  }
  await page.route('https://cdnjs.cloudflare.com/**',route=>route.abort());
  await page.route('https://cdn.jsdelivr.net/**',route=>route.abort());
  await page.addInitScript(() => {
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let mode=32, activeEQ=0;
    let custom=[{id:7,name:Array.from(new TextEncoder().encode('Custom1')),gains:[0,0,0,0,0,0],frequencies:[62,250,1000,4000,8000,16000],selected:0}];
    let table=[1,1,2,1,1,1,3,6,1,1,4,8,2,1,2,1,2,1,3,6,2,1,4,8,4,6,2,29];
    const reply=(command:number,seq:number,data:number[])=> {
      const length=7+data.length;
      controller.enqueue(new Uint8Array([170,length,0,0,command&255,command>>8,seq,data.length,0,...data]));
    };
    window.addEventListener('test-battery-push', event => reply(0x0204,255,(event as CustomEvent<number[]>).detail));
    const port={
      open: async()=>{}, close:async()=>{},
      readable: new ReadableStream<Uint8Array>({start(c){controller=c;}}),
      writable:new WritableStream<Uint8Array>({write(bytes){
        const command=bytes[4]|(bytes[5]<<8),seq=bytes[6],payload=Array.from(bytes.slice(9));
        switch(command){
          case 0x0100:reply(0x8100,seq,[0,255,255,255,255,4,0,0]);break;
          case 0x0103:reply(0x8103,seq,[0,18,72,6]);break;
          case 0x0200:reply(0x8200,seq,[0,3,1,2,3]);break;
          case 0x0205:reply(0x8205,seq,[1,3,1,0,2,0,3,0]);break;
          case 0x0106:reply(0x8106,seq,[0,3,1,90,2,85,3,70]);break;
          case 0x010c:reply(0x810c,seq,[0,1,1,mode]);break;
          case 0x010d:reply(0x810d,seq,[0,6,4,1,6,0,9,0,24,0,27,0,26,0]);break;
          case 0x010f:reply(0x810f,seq,[0,activeEQ]);break;
          case 0x0122:reply(0x8122,seq,[0,custom.length,...custom.flatMap(p=>[p.selected,250,6,p.id,p.name.length,...p.name,6,...p.frequencies.flatMap((f,i)=>[f&255,f>>8,p.gains[i]&255])])]);break;
          case 0x0418:{
            const n=payload[4], bands=payload[5+n];
            const item={id:payload[3],name:payload.slice(5,5+n),gains:[] as number[],frequencies:[] as number[],selected:0};
            for(let i=0;i<bands;i++){const o=6+n+i*3;item.frequencies.push(payload[o]|(payload[o+1]<<8));item.gains.push(payload[o+2]>127?payload[o+2]-256:payload[o+2]);}
            if(payload[0]===1){item.id=7+custom.length;custom.push(item);}
            else if(payload[0]===3){custom=custom.filter(p=>p.id!==item.id).map((p,i)=>({...p,id:7+i,selected:0}));activeEQ=3;}
            else{custom=custom.map(p=>p.id===item.id?{...item,selected:1}:{...p,selected:0});activeEQ=item.id;}
            reply(0x8418,seq,[0,item.id]);break;
          }
          case 0x0108:reply(0x8108,seq,[0,table.length/4,...table]);break;
          case 0x0404:mode=payload[2];reply(0x8404,seq,[0]);break;
          case 0x0401:table=payload.slice(1);reply(0x8401,seq,[0]);break;
          default:reply(command|0x8000,seq,[1]);
        }
      }}),
    };
    Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>port},configurable:true});
  });
});

for(const width of [320,390,768,1440]) {
  test(`original dashboard remains usable at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1100});
    await page.goto('/');
    await expect.poll(async()=>page.locator('img').evaluateAll(nodes=>nodes.every(n=>n.complete && n.naturalWidth>0))).toBe(true);
    await expect(page.locator('#connect-btn-landing').locator('..')).toHaveCSS('opacity','1');
    await page.screenshot({path:`test-results/air7-landing-${width}.png`});
    await page.getByRole('button',{name:/connect/i}).click();
    await expect(page.getByRole('heading',{name:'Noise cancellation strength'})).toBeVisible();
    await expect(page.getByRole('group',{name:'Left bud battery',exact:true})).toContainText('90%');
    await expect(page.getByRole('group',{name:'Right bud battery',exact:true})).toContainText('85%');
    await expect(page.getByRole('group',{name:'Case battery',exact:true})).toContainText('70%');
    await expect.poll(async()=>page.locator('img').evaluateAll(nodes=>nodes.every(n=>n.complete && n.naturalWidth>0))).toBe(true);
    await expect(page.locator('#touch-1-hold')).toHaveText('Switch noise control modes');
    await expect(page.locator('#touch-2-hold')).toHaveText('Switch noise control modes');
    for(const [label,value] of [['Max',8],['Moderate',16],['Mild',4],['Smart',32]] as const) {
      await page.getByRole('button',{name:label,exact:true}).click();
      await expect(page.locator(`#anc-strength-${value}`)).toHaveAttribute('aria-pressed','true');
    }
    await page.getByRole('button',{name:'Off',exact:true}).click();
    await expect(page.locator('#anc-strength-32')).toBeDisabled();
    await page.getByRole('button',{name:'Noise cancellation',exact:true}).click();
    await expect(page.locator('#anc-strength-32')).toHaveAttribute('aria-pressed','true');
    await expect(page.getByText('Golden Sound',{exact:true})).toHaveCount(0);
    await page.locator('#touch-1-triple').click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('listbox')).toHaveCSS('opacity','1');
    await expect(page.getByRole('option',{name:'Previous Track',exact:true})).toBeVisible();
    await page.screenshot({path:`test-results/air7-dropdown-${width}.png`});
    await page.keyboard.press('Escape');
    await page.locator('#touch-1-hold').click();
    await page.getByRole('option',{name:'Voice Assistant',exact:true}).click();
    await page.getByRole('button',{name:'Apply Left',exact:true}).click();
    await expect(page.getByText('Button settings saved', {exact:true})).toBeVisible();
    await expect(page.locator('#touch-2-hold')).toHaveText('Switch noise control modes');
    await expect(page.locator('#touch-1-double')).toHaveText('Play / Pause');
    await expect(page.locator('#bass-intensity-slider')).toBeDisabled();
    const eqCard=page.getByRole('heading',{name:'EQ mode',exact:true}).locator('xpath=../..');
    const bassCard=page.getByRole('heading',{name:'Dynamic Bass',exact:true}).locator('xpath=../..');
    if(width>=768){const eqBox=await eqCard.boundingBox(),bassBox=await bassCard.boundingBox();expect(Math.abs(bassBox!.y-(eqBox!.y+eqBox!.height)-20)).toBeLessThan(2);const systemBox=await page.getByRole('heading',{name:'System Features',exact:true}).locator('xpath=../..').boundingBox();expect(Math.abs(systemBox!.y+systemBox!.height-bassBox!.y-bassBox!.height)).toBeLessThan(2);}
    else{const ys=await page.locator('h2').evaluateAll(nodes=>nodes.slice(0,4).map(n=>({name:n.textContent?.trim(),y:n.getBoundingClientRect().y})).sort((a,b)=>a.y-b.y).map(n=>n.name));expect(ys).toEqual(['Noise control','EQ mode','System Features','Dynamic Bass']);}
    await page.getByRole('button',{name:'New preset',exact:true}).click();
    await page.getByLabel('Preset name',{exact:true}).fill('Evening music');
    await page.getByLabel('Custom EQ band 1',{exact:true}).focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByLabel('Custom EQ band 1',{exact:true})).not.toHaveValue('0');
    await page.getByRole('button',{name:'Create preset',exact:true}).click();
    await expect(page.getByRole('button',{name:'Evening music',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:'Manage preset Evening music',exact:true}).click();
    await page.getByRole('menuitem',{name:'Rename',exact:true}).click();
    await expect(page.getByLabel('Preset name',{exact:true})).toBeFocused();
    await page.getByLabel('Preset name',{exact:true}).fill('Night music');
    await page.getByRole('button',{name:'Save preset',exact:true}).click();
    await expect(page.getByRole('button',{name:'Night music',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:'Custom1',exact:true}).click();
    await expect(page.getByRole('button',{name:'Custom1',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:'Manage preset Night music',exact:true}).click();
    await page.getByRole('menuitem',{name:'Edit EQ',exact:true}).click();
    await expect(page.getByLabel('Custom EQ band 1',{exact:true})).toBeFocused();
    await expect(page.getByLabel('Preset name',{exact:true})).toHaveValue('Night music');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('button',{name:'Manage preset Custom1',exact:true}).click();
    await page.getByRole('menuitem',{name:'Delete',exact:true}).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button',{name:'Delete preset',exact:true}).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(page.getByRole('button',{name:'Custom1',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Night music',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const panels=await page.locator('#touch-1-double, #touch-2-double').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().x));
    expect(width>=768 ? panels[0]!==panels[1] : panels[0]===panels[1]).toBe(true);
    await expect(page.getByText('Button settings saved', {exact:true})).toBeHidden({timeout:8000});
    await page.evaluate(()=>window.scrollTo(0,0));
    await expect(page.getByAltText('realme Buds Air 7 left earbud').first().locator('xpath=../../..')).toHaveCSS('opacity','1');
    await page.screenshot({path:`test-results/air7-${width}.png`,fullPage:true});
  });
}

test('battery display follows charging, case availability and manual refresh',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/connect/i}).click();
  const left=page.getByRole('group',{name:'Left bud battery',exact:true});
  const right=page.getByRole('group',{name:'Right bud battery',exact:true});
  const chargingCase=page.getByRole('group',{name:'Case battery',exact:true});
  await expect(chargingCase).toContainText('70%');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('test-battery-push',{detail:[1,2,2,128|60,3,0]})));
  await expect(right).toContainText('60%');
  await expect(right).toContainText('Charging');
  await expect(left).toContainText('90%');
  await expect(chargingCase).toContainText('Not reported');
  await expect(chargingCase).not.toContainText('0%');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('test-battery-push',{detail:[1,1,3,55]})));
  await expect(chargingCase).toContainText('55%');
  await page.getByRole('button',{name:'Refresh battery levels',exact:true}).click();
  await expect(chargingCase).toContainText('70%');
  await expect(right).toContainText('85%');
  await expect(right).not.toContainText('Charging');
});
