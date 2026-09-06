// playwright の在り処だけを環境ごとに吸収する。PW_PLAYWRIGHT で明示指定も可。
let mod;
const tries=[process.env.PW_PLAYWRIGHT,'playwright','/opt/node22/lib/node_modules/playwright/index.mjs'].filter(Boolean);
for(const t of tries){ try{ mod=await import(t); break; }catch(e){} }
if(!mod) throw new Error('playwright が見つかりません。`npm i -D playwright` するか PW_PLAYWRIGHT にパスを指定してください。');
export const chromium = mod.chromium;

// 入口の合言葉（v0.3.104）：検査は解錠済みの端末として起動する。合言葉そのものは持たない（ハッシュだけ）
export const PASS_HASH='1043819599ce5f51aa0d72251e2b5a18aa239fba8838621e6252032317d30f0f';
export const unlock=ctx=>ctx.addInitScript(h=>{ try{ localStorage.setItem('mics009.pass',h); }catch(e){} }, PASS_HASH);
