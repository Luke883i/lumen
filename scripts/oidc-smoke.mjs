// Safe provider metadata smoke: no login, user token or browser authorization.
import * as oidc from 'openid-client';
import {oidcConfiguration} from '../src/oidc.mjs';
const report={gate:'OIDC_PROVIDER_METADATA',revision:process.env.GIT_SHA||'unbound',time:new Date().toISOString(),checks:[]};
try{
 const env=oidcConfiguration(process.env);
 if(!env.enabled)throw Error('OIDC_NOT_CONFIGURED');
 const config=await oidc.discovery(new URL(env.issuer),env.clientId,env.clientSecret);
 const meta=config.serverMetadata();
 const actual=meta.issuer;
 const auth=new URL(meta.authorization_endpoint);
 const tokens=new URL(meta.token_endpoint);
 const jwks=new URL(meta.jwks_uri);
 report.checks.push({name:'issuer',ok:actual===env.issuer.replace(/\/$/,'')});
 report.checks.push({name:'authorization_endpoint',ok:auth.protocol==='https:'});
 report.checks.push({name:'token_endpoint',ok:tokens.protocol==='https:'});
 report.checks.push({name:'jwks_uri',ok:jwks.protocol==='https:'});
 report.checks.push({name:'authorization_code_supported',ok:!meta.response_types_supported || meta.response_types_supported.includes('code')});
 report.checks.push({name:'s256_pkce_supported',ok:Array.isArray(meta.code_challenge_methods_supported)&&meta.code_challenge_methods_supported.includes('S256')});
}catch(e){report.checks.push({name:'configuration_or_discovery',ok:false,code:String(e.code||e.message||'INVALID_PROVIDER').slice(0,80)});}
report.status=report.checks.every(x=>x.ok)?'PASS':'BLOCKED';
console.log(JSON.stringify(report,null,2));
if(report.status!=='PASS')process.exitCode=1;
