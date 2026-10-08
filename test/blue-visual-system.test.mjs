import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const css=read('public/style.css');
const tokenBlock=css.match(/:root\s*\{([\s\S]*?)\}/)?.[1]||'';
const tokens=Object.fromEntries([...tokenBlock.matchAll(/(--lumen-[\w-]+)\s*:\s*([^;]+);/g)]
  .map(([,key,value])=>[key,value.trim()]));
const luminance=value=>{
 const channels=value.match(/^#([0-9a-f]{6})$/i)?.[1];
 assert.ok(channels,'expected six-digit color: '+value);
 const [r,g,b]=[0,2,4].map(i=>parseInt(channels.slice(i,i+2),16)/255)
  .map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
 return .2126*r+.7152*g+.0722*b;
};
const contrast=(a,b)=>{
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
};
const gradientStops=name=>{
 const cssValue=tokens[name];
 assert.match(cssValue,/^linear-gradient\(/);
 return [...cssValue.matchAll(/#[0-9a-f]{6}\b/ig)].map(x=>x[0]);
};

test('UX-S6A: one canonical blue identity across CSS, HTML, PWA and SVG icon',()=>{
 const manifest=JSON.parse(read('public/manifest.webmanifest'));
 const html=read('public/index.html'),svg=read('public/icons/lumen.svg');
 assert.equal(tokens['--lumen-ink'],manifest.theme_color);
 assert.equal(tokens['--lumen-paper'],manifest.background_color);
 assert.ok(html.includes('name="theme-color" content="'+manifest.theme_color+'"'));
 assert.ok(svg.includes('stop-color="'+manifest.theme_color+'"'));
 assert.ok(svg.includes('linearGradient'));
 assert.equal(css.includes('--lumen-teal'),false);
 assert.equal(css.includes('--lumen-gold'),false);
 assert.equal(read('public/app.js').includes('btn gold'),false);
 assert.ok(read('public/app.js').includes('btn search-primary'));
});

test('UX-S6A: text, statuses and gradient endpoints have validated light-theme contrast',()=>{
 const pairs=[
  [tokens['--lumen-body'],tokens['--lumen-paper']],
  [tokens['--lumen-muted'],tokens['--lumen-paper']],
  [tokens['--lumen-ink'],tokens['--lumen-white']],
  [tokens['--lumen-success-ink'],tokens['--lumen-success-soft']],
  [tokens['--lumen-warn-ink'],tokens['--lumen-warn-soft']],
  ['#17478f',tokens['--lumen-blue-soft']]
 ];
 for(const [fg,bg] of pairs)assert.ok(contrast(fg,bg)>=4.5,
   'body or semantic label contrast failed: '+fg+' on '+bg+' = '+contrast(fg,bg));
 for(const key of ['--lumen-gradient-hero','--lumen-gradient-cta']){
  const stops=gradientStops(key);
  assert.ok(stops.length>=2);
  for(const background of stops)assert.ok(contrast('#ffffff',background)>=4.5,
    key+': low-contrast white foreground on '+background);
 }
 for(const sky of gradientStops('--lumen-gradient-sky'))
  assert.ok(contrast(tokens['--lumen-ink'],sky)>=4.5,'search CTA contrast');
 assert.ok(contrast(tokens['--lumen-focus'],tokens['--lumen-white'])>=3);
 assert.ok(contrast(tokens['--lumen-focus-on-dark'],tokens['--lumen-ink'])>=3);
});

test('UX-S6A: gradients stay deliberate; never inflate compact UX-S4 dimensions',()=>{
 for(const key of ['--lumen-gradient-hero','--lumen-gradient-cta','--lumen-gradient-sky'])
  assert.ok(tokens[key].startsWith('linear-gradient('),key);
 assert.equal(tokens['--lumen-hero-max-desktop'],'240px');
 assert.equal(tokens['--lumen-hero-max-mobile'],'180px');
 assert.equal(tokens['--lumen-cover-width'],'56px');
 assert.equal(tokens['--lumen-cover-height'],'76px');
 assert.match(css,/\.card,\s*\.nav-more-menu,\s*\.task-link/);
 assert.ok(css.includes('.btn:not(.alt):not(.ghost):not(.search-primary):not(.danger-action)'));
 assert.match(css,/\.install-panel\s*\{\s*background:linear-gradient\(/);
 assert.doesNotMatch(css,/\.card\s*\{\s*background:linear-gradient\(/);
});

test('UX-S6A: Android/Windows install PNG assets are branded and readable',()=>{
 for(const n of [192,512]){
  const b=readFileSync(new URL('public/icons/icon-'+n+'.png',root));
  assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(b.readUInt32BE(16),n);
  assert.equal(b.readUInt32BE(20),n);
  assert.equal(b[25],3,'indexed PNG palette expected');
  const paletteStart=b.indexOf(Buffer.from('PLTE'));
  assert.ok(paletteStart>20);
  const palette=b.subarray(paletteStart+4,paletteStart+300);
  assert.ok(palette.includes(11)&&palette.includes(37)&&palette.includes(80),
    'brand-navy palette must be present');
 }
 const manifest=JSON.parse(read('public/manifest.webmanifest'));
 for(const size of [192,512])
  assert.ok(manifest.icons.some(x=>x.sizes===size+'x'+size));
});

test('UX-S6A: versioned offline cache includes branded install assets',()=>{
 const sw=read('public/sw.js');
 assert.match(sw,/lumen-static-v5/);
 for(const file of ['style.css','manifest.webmanifest','lumen.svg','icon-192.png','icon-512.png'])
  assert.ok(sw.includes(file),file+' missing from offline asset cache');
});
