/* Credentials belong to the top-level PWA, never to transient Google frames. */
(function(root){
  'use strict';
  const VERSION='1.01.1-r2',PROTOCOL=2;
  function install(options){
    const env=options.environment,frame=options.frame;
    if(!['TEST','PROD'].includes(env))throw Error('Invalid environment');
    const key='kovarna_delivery_identity_v2_'+env;
    let peer=null,origin='',nonce='',channel='',supportsStorage=false,persisted=null;
    const uuid=()=>root.crypto.randomUUID?root.crypto.randomUUID():Array.from(root.crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');
    const googleOrigin=value=>{
      try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='script.google.com'||u.hostname==='script.googleusercontent.com'||u.hostname.endsWith('.googleusercontent.com'));}catch(_){return false;}
    };
    function descendant(source){
      try{for(let i=0,w=source;w&&i<8;i++){
        if(w===frame.contentWindow)return true;
        if(w===w.parent)return false;w=w.parent;
      }}catch(_){}return false;
    }
    function valid(r){return !!r&&r.schema===2&&r.environment===env&&typeof r.clientId==='string'&&/^[a-zA-Z0-9_.:-]{8,200}$/.test(r.clientId)&&typeof r.token==='string'&&/^[a-f0-9]{64}$/i.test(r.token);}
    function read(){
      const raw=root.localStorage.getItem(key);
      if(raw===null)return null;
      let r;try{r=JSON.parse(raw);}catch(_){throw Error('STORAGE_CORRUPT');}
      if(!valid(r)||typeof r.revision!=='string')throw Error('STORAGE_CORRUPT');
      return r;
    }
    function probe(){
      const probeKey=key+'_probe',value=uuid();
      root.localStorage.setItem(probeKey,value);
      if(root.localStorage.getItem(probeKey)!==value)throw Error('STORAGE_UNAVAILABLE');
      root.localStorage.removeItem(probeKey);
    }
    function owns(event){return !!peer&&event.source===peer&&event.origin===origin&&descendant(event.source);}
    function reply(event,data){event.source.postMessage(data,event.origin);}
    function storageInfo(){return {mode:'PWA_FIRST_PARTY',shellVersion:VERSION,persisted};}
    function onMessage(event){
      const d=event.data;
      if(!d||typeof d!=='object'||!googleOrigin(event.origin)||!descendant(event.source))return;
      if(d.type==='KOVARNA_DELIVERY_READY'){
        if(typeof d.nonce!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(d.nonce))return;
        if(d.protocol===PROTOCOL&&d.environment!==env)return;
        if(peer!==event.source||nonce!==d.nonce){channel=uuid();peer=event.source;origin=event.origin;nonce=d.nonce;}
        supportsStorage=d.protocol===PROTOCOL&&d.environment===env;
        options.onReady(peer,origin);
        reply(event,{type:'KOVARNA_PWA_READY',protocol:PROTOCOL,environment:env,shellVersion:VERSION,nonce,channel});
        return;
      }
      if(d.type!=='KOVARNA_STORAGE_REQUEST'||!owns(event)||!supportsStorage||d.protocol!==PROTOCOL||d.environment!==env||d.nonce!==nonce||d.channel!==channel)return;
      if(typeof d.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(d.requestId))return;
      const answer={type:'KOVARNA_STORAGE_RESPONSE',protocol:PROTOCOL,environment:env,nonce,channel,requestId:d.requestId,ok:false,storage:storageInfo()};
      try{
        if(d.action==='READ'){
          probe();const record=read();Object.assign(answer,{ok:true,record,revision:record?record.revision:null});
        }else if(d.action==='WRITE'){
          if(!valid(d.record))throw Error('STORAGE_INVALID');
          const old=read();
          if((old?old.revision:null)!==d.expectedRevision)throw Error('STORAGE_CONFLICT');
          const record={schema:2,environment:env,clientId:d.record.clientId,token:d.record.token,revision:uuid(),savedAt:new Date().toISOString()};
          const raw=JSON.stringify(record);root.localStorage.setItem(key,raw);
          if(root.localStorage.getItem(key)!==raw)throw Error('STORAGE_UNAVAILABLE');
          Object.assign(answer,{ok:true,revision:record.revision});
        }else throw Error('STORAGE_INVALID');
      }catch(e){answer.errorCode=['STORAGE_CORRUPT','STORAGE_CONFLICT','STORAGE_INVALID'].includes(e.message)?e.message:'STORAGE_UNAVAILABLE';}
      reply(event,answer);
    }
    root.addEventListener('message',onMessage);
    // Best effort only: a denied/unsupported persist request never prevents use.
    try{const s=root.navigator.storage;if(s&&s.persisted)s.persisted().then(value=>{
      persisted=!!value;if(!value&&s.persist)return s.persist().then(granted=>{persisted=!!granted;});
    }).catch(()=>{});}catch(_){}
    return {owns,version:VERSION};
  }
  root.KovarnaIdentityBridge={install,version:VERSION};
})(window);
