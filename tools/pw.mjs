// playwright の在り処だけを環境ごとに吸収する。PW_PLAYWRIGHT で明示指定も可。
let mod;
const tries=[process.env.PW_PLAYWRIGHT,'playwright','/opt/node22/lib/node_modules/playwright/index.mjs'].filter(Boolean);
for(const t of tries){ try{ mod=await import(t); break; }catch(e){} }
if(!mod) throw new Error('playwright が見つかりません。`npm i -D playwright` するか PW_PLAYWRIGHT にパスを指定してください。');
export const chromium = mod.chromium;
