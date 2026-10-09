// Public library-service metadata. NOT a grant of software rights or legal
// approval. Missing policy URLs are exposed as unconfigured, not fabricated.
const cleanName=value=>{
 const name=String(value||'').trim();
 return name&&name.length<=120&&!/[\u0000-\u001f]/.test(name)?name:null;
};
const httpsLink=value=>{
 if(!value)return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.hostname==='localhost')return null;
  return url.href;
 }catch{return null;}
};
export function institutionSettings(env=process.env){
 const name=cleanName(env.LUMEN_INSTITUTION_NAME);
 const policies={
  terms:httpsLink(env.LUMEN_SERVICE_TERMS_URL),
  privacy:httpsLink(env.LUMEN_PRIVACY_URL),
  accessibility:httpsLink(env.LUMEN_ACCESSIBILITY_URL),
  support:httpsLink(env.LUMEN_SUPPORT_URL)
 };
 return Object.freeze({
  name,policies:Object.freeze(policies),
  completeness:name&&policies.terms&&policies.privacy&&policies.support?'configured':'incomplete'
 });
}
