/* Local diagnostics: explicit fields only. Never collect inputs, credentials or HTTP bodies. */
(function(root){
  'use strict';
  const VERSION='1.04.15-r1',MAX_EVENTS=1800,MAX_INCIDENTS=10,MAX_BYTES=750000,MAX_AGE=7*86400000;
  const FIELDS=new Set(('screen version serverVersion shellVersion method requestId durationMs reason errorName online visible standalone storageMode persisted hasIdentity hasClient registrationPending authenticated connectionBusy operationBusy returnScreen retryCount pendingCheck outcomeUncertain hasVoucher hasTicket inputLength inputFormat protocol bridgeReady revisionChanged status registration database service diagnosticsStored warning viewportWidth viewportHeight sequence attempt resource frames stage incidentId cached source errorCode').split(' '));
  function clean(value,max){return String(value==null?'':value).replace(/\b[a-f0-9]{40,}\b/gi,'[skryto]').replace(/\b\d{6}\b/g,'[skryto]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[skryto]').replace(/https?:\/\/\S+/g,'[adresa vynechána]').slice(0,max||180);}
  function details(value){const out={};if(!value||typeof value!=='object')return out;for(const k of FIELDS){const v=value[k];if(v==null)continue;if(typeof v==='boolean')out[k]=v;else if(typeof v==='number'&&Number.isFinite(v))out[k]=v;else if(typeof v==='string')out[k]=clean(v,k==='frames'?1000:180);}return out;}
  function code(value){return clean(value,64).replace(/[^a-zA-Z0-9_.:-]/g,'_');}
  function uuid(){try{return root.crypto.randomUUID();}catch(_){return 'r-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}}
  function frames(error){return String(error&&error.stack||'').split('\n').slice(1,13).map(line=>{const m=line.match(/(?:at\s+)?([a-zA-Z_$][\w.$<>]*)?.*?:(\d+):(\d+)\)?$/);return m?(m[1]||'anonymous')+':'+m[2]+':'+m[3]:'';}).filter(Boolean).join('\n');}
  function create(options){
    const env=options.environment==='TEST'?'TEST':'PROD',source=options.source==='SHELL'?'SHELL':'CLIENT',sessionId=uuid();
    const storageKey='kovarna_support_v1_'+env+'_'+source;
    let data={schema:1,events:[],incidents:[]},storageStatus='NOT_CHECKED',persistTimer=null,active=null,dialog=null,previousFocus=null,dismissed='',dismissedAt=0,state={},seq=0,fitDialog=null;
    const now=()=>new Date().toISOString();
    function normalizeEvent(e){return {id:code(e.id)||uuid(),at:isNaN(Date.parse(e.at))?now():new Date(e.at).toISOString(),sessionId:code(e.sessionId),source:e.source==='SHELL'?'SHELL':'CLIENT',action:code(e.action),result:code(e.result),details:details(e.details)};}
    try{const saved=JSON.parse(root.localStorage.getItem(storageKey)||'null');if(saved&&saved.schema===1){
      data.events=(Array.isArray(saved.events)?saved.events:[]).slice(-MAX_EVENTS).filter(e=>e&&Date.parse(e.at)>Date.now()-MAX_AGE).map(normalizeEvent);
      data.incidents=(Array.isArray(saved.incidents)?saved.incidents:[]).slice(-MAX_INCIDENTS).filter(i=>i&&Date.parse(i.at)>Date.now()-MAX_AGE).map(i=>({id:code(i.id),at:new Date(i.at).toISOString(),code:code(i.code),state:details(i.state),events:(Array.isArray(i.events)?i.events:[]).slice(-100).map(normalizeEvent)}));
    }storageStatus='READ_OK';}catch(_){storageStatus='UNAVAILABLE';}
    function persist(){
      if(persistTimer){root.clearTimeout(persistTimer);persistTimer=null;}
      data.events=data.events.filter(e=>Date.parse(e.at)>Date.now()-MAX_AGE).slice(-MAX_EVENTS);
      data.incidents=data.incidents.filter(i=>Date.parse(i.at)>Date.now()-MAX_AGE).slice(-MAX_INCIDENTS);
      try{let raw=JSON.stringify(data);while(raw.length>MAX_BYTES&&data.events.length>100){data.events.splice(0,100);raw=JSON.stringify(data);}while(raw.length>MAX_BYTES&&data.incidents.length>1){data.incidents.shift();raw=JSON.stringify(data);}root.localStorage.setItem(storageKey,raw);storageStatus='SAVED';}catch(_){storageStatus='UNAVAILABLE';}
    }
    function record(action,result,meta,imported){
      const event=imported?normalizeEvent(imported):normalizeEvent({id:uuid(),at:now(),sessionId,source,action,result,details:Object.assign({sequence:++seq},meta||{})});
      if(!data.events.some(e=>e.id===event.id))data.events.push(event);
      if(data.events.length>MAX_EVENTS)data.events.splice(0,data.events.length-MAX_EVENTS);
      if(root.setTimeout&&!persistTimer)persistTimer=root.setTimeout(persist,350);
      try{if(options.onEvent&&!imported)options.onEvent(event);}catch(_){}
      return event;
    }
    function update(value){state=Object.assign(state,details(value));}
    function environment(){
      const n=root.navigator||{},d=root.document||{},v=root.visualViewport;
      return {reportVersion:VERSION,environment:env,source,sessionId,createdAt:now(),timezone:(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone;}catch(_){return '';}})(),utcOffsetMinutes:-new Date().getTimezoneOffset(),userAgent:clean(n.userAgent,400),language:clean(n.language,40),online:n.onLine!==false,visible:!d.hidden,standalone:!!n.standalone||!!(root.matchMedia&&root.matchMedia('(display-mode: standalone)').matches),viewport:{width:v?v.width:root.innerWidth,height:v?v.height:root.innerHeight,scale:v?v.scale:1},diagnosticStorage:storageStatus,retention:{days:7,maxEvents:MAX_EVENTS,maxIncidents:MAX_INCIDENTS},state:details(state)};
    }
    function report(){
      persist();
      return ['APP-KOVÁRNA — HLÁŠENÍ CHYB','Identifikátor hlášení: '+(active?active.id:uuid()),'Vytvořeno: '+now(),'Časy událostí jsou v UTC (Z); časové pásmo telefonu je uvedeno níže.','Obsahuje dostupné záznamy této aplikace. Chybějící starší záznamy nelze zpětně vytvořit.','Bez PINů, registračních kódů, přístupových klíčů, obsahu QR a zákaznických vstupů.','','PROSTŘEDÍ A AKTUÁLNÍ STAV',JSON.stringify(environment(),null,2),'','UCHOVANÉ CHYBY A JEJICH PŘEDCHOZÍ PRŮBĚH',JSON.stringify(data.incidents,null,2),'','ČASOVÁ OSA ('+data.events.length+' událostí)',...data.events.map(e=>JSON.stringify(e))].join('\n');
    }
    function filename(){const d=new Date(),pad=n=>String(n).padStart(2,'0');return 'App-Kovárna Hlášení chyb '+d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+'-'+pad(d.getMinutes())+'-'+pad(d.getSeconds())+'.txt';}
    function note(text){if(dialog)dialog.querySelector('[data-note]').textContent=text;}
    async function download(){
      record('REPORT','EXPORT_START');const name=filename(),text=report(),blob=new root.Blob(['\uFEFF',text],{type:'text/plain;charset=utf-8'});
      try{
        const file=typeof root.File==='function'?new root.File([blob],name,{type:'text/plain'}):null;
        const ios=/iPhone|iPad|iPod/.test((root.navigator||{}).userAgent||'')||((root.navigator||{}).platform==='MacIntel'&&(root.navigator||{}).maxTouchPoints>1);
        if(ios&&file&&root.navigator.canShare&&root.navigator.canShare({files:[file]})&&root.navigator.share){
          note('V nabídce telefonu zvolte „Uložit do Souborů“.');
          await root.navigator.share({files:[file]});record('REPORT','SAVE_DIALOG_COMPLETED');
          note('Pokud jste soubor uložili, přiložte jej ve WhatsAppu jako dokument.');
        }else{
          const url=root.URL.createObjectURL(blob),a=root.document.createElement('a');a.href=url;a.download=name;a.style.display='none';root.document.body.appendChild(a);a.click();a.remove();root.setTimeout(()=>root.URL.revokeObjectURL(url),120000);
          record('REPORT','DOWNLOAD_REQUESTED');note('Soubor je připraven ke stažení. Najdete jej v Souborech nebo ve Stažených souborech.');
        }
      }catch(e){record('REPORT',e&&e.name==='AbortError'?'SAVE_CANCELLED':'SAVE_FAILED',{errorName:e&&e.name,frames:frames(e)});note(e&&e.name==='AbortError'?'Ukládání bylo zrušeno. Můžete jej spustit znovu.':'Soubor se nepodařilo uložit. Zkuste tlačítko znovu.');}
      persist();
    }
    function close(){if(!dialog)return;dismissed=active?active.code:'';dismissedAt=Date.now();dialog.remove();dialog=null;fitDialog=null;try{previousFocus&&previousFocus.isConnected&&previousFocus.focus();}catch(_){}record('REPORT','DIALOG_CLOSED');try{options.onDismiss&&options.onDismiss();}catch(_){}}
    function show(problem){
      if(!root.document||!root.document.createElement)return;
      if(dialog){paint(problem);return;}
      previousFocus=root.document.activeElement;try{previousFocus&&previousFocus.blur();}catch(_){}
      const styleId='kovarna-support-style';if(!root.document.getElementById(styleId)){
        const style=root.document.createElement('style');style.id=styleId;style.textContent=`
        #kovarna-support{position:fixed!important;inset:0!important;width:auto!important;height:auto!important;z-index:2147483646!important;display:flex!important;align-items:center;justify-content:center;background:#000a;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));box-sizing:border-box;font-family:Arial,sans-serif;font-size:18px;color:#f7f1e8;line-height:1.35}
        #kovarna-support *{box-sizing:border-box}#kovarna-support .ks-card{width:100%;max-width:440px;max-height:100%;min-height:0;display:flex;flex-direction:column;background:#282020;border:2px solid #e46b65;border-radius:16px;box-shadow:0 15px 55px #0009;padding:16px;gap:12px;overflow:hidden}
        #kovarna-support .ks-heading{display:flex;align-items:flex-start;gap:10px;flex:none}#kovarna-support h2{font-size:23px;line-height:1.2;margin:0;flex:1;color:#f7f1e8}#kovarna-support .ks-warning{color:#ff8b80;font-size:28px;line-height:1}
        #kovarna-support button{font-family:Arial,sans-serif;border:0;cursor:pointer;font-weight:800;line-height:1.2;color:#fff;width:100%;min-height:52px;border-radius:12px;padding:12px;font-size:18px;white-space:normal;overflow-wrap:normal;margin:0;flex:none}
        #kovarna-support .ks-close{width:44px;min-width:44px;min-height:44px;height:44px;padding:0;font-size:28px;border-radius:9px;background:#4b3a34}
        #kovarna-support .ks-body{min-height:0;overflow:auto;overscroll-behavior:contain}#kovarna-support p{font-size:18px;line-height:1.35;margin:0;color:#f7f1e8}#kovarna-support .ks-note{font-size:15px;line-height:1.3;color:#d9ccc4;margin:9px 0 0}
        #kovarna-support .ks-save{background:#e87b28;min-height:64px}#kovarna-support .ks-next{background:#4b3a34}#kovarna-support button:focus-visible{outline:3px solid #fff;outline-offset:2px}
        @media(max-height:460px){#kovarna-support{padding:8px}#kovarna-support .ks-card{gap:8px;padding:12px;max-width:560px}#kovarna-support h2{font-size:20px}#kovarna-support .ks-save{min-height:48px}#kovarna-support button{min-height:44px}#kovarna-support .ks-note{font-size:14px}}
        `;root.document.head.appendChild(style);
      }
      dialog=root.document.createElement('div');dialog.id='kovarna-support';dialog.innerHTML='<section class="ks-card" role="alertdialog" aria-modal="true" aria-labelledby="ks-title" aria-describedby="ks-text"><div class="ks-heading"><span class="ks-warning" aria-hidden="true">⚠</span><h2 id="ks-title"></h2><button class="ks-close" type="button" aria-label="Zavřít">×</button></div><div class="ks-body"><p id="ks-text"></p></div><button class="ks-save" type="button">↓ ULOŽIT HLÁŠENÍ CHYBY</button><div class="ks-body"><p class="ks-note" data-note>Soubor pošlete Martinovi přes WhatsApp.</p></div><button class="ks-next" type="button"></button></section>';
      function paint(problem){
      dialog.querySelector('h2').textContent=clean(problem.title,140);dialog.querySelector('#ks-text').textContent=clean(problem.message,360);dialog.querySelector('.ks-next').textContent=clean(problem.actionLabel||'ZAVŘÍT',60);
      dialog.querySelector('.ks-save').onclick=download;dialog.querySelector('.ks-close').onclick=close;
      dialog.querySelector('.ks-next').onclick=()=>{const action=problem.action||'close';close();try{options.onAction&&options.onAction(action);}catch(_){};};
      }
      paint(problem);
      dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='Tab'){const b=[...dialog.querySelectorAll('button')],first=b[0],last=b[b.length-1];if(e.shiftKey&&root.document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&root.document.activeElement===last){e.preventDefault();first.focus();}}});
      root.document.body.appendChild(dialog);dialog.querySelector('.ks-save').focus({preventScroll:true});record('REPORT','DIALOG_SHOWN',{errorCode:problem.code});
      // The host runs outside Google's nested iframe: size to the real visual viewport.
      const fit=()=>{if(!dialog)return;const v=root.visualViewport;if(v){dialog.style.setProperty('top',v.offsetTop+'px','important');dialog.style.setProperty('left',v.offsetLeft+'px','important');dialog.style.setProperty('right','auto','important');dialog.style.setProperty('bottom','auto','important');dialog.style.setProperty('width',v.width+'px','important');dialog.style.setProperty('height',v.height+'px','important');}};fitDialog=fit;fit();root.setTimeout(fit,250);root.setTimeout(fit,600);
    }
    function error(problem){
      const key=code(problem.code||'UNKNOWN'),last=data.incidents[data.incidents.length-1];record('ERROR',key,{screen:state.screen,reason:problem.reason});
      if(!last||last.code!==key||Date.now()-Date.parse(last.at)>30000){active={id:uuid(),at:now(),code:key,state:details(state),events:data.events.slice(-100)};data.incidents.push(active);}else if(!dialog)active=last;
      persist();try{options.onProblem&&options.onProblem(problem);}catch(_){}if(problem.show!==false&&!(dismissed===key&&Date.now()-dismissedAt<30000&&!problem.force))show(problem);
      return active&&active.id;
    }
    function recovered(){if(dialog){note('Spojení bylo obnoveno. Hlášení chyby můžete stále uložit.');const b=dialog.querySelector('.ks-next');b.textContent='POKRAČOVAT';b.onclick=close;}}
    function runtimeError(e){const err=e&&e.error||e&&e.reason;record('RUNTIME','EXCEPTION',{errorName:err&&err.name||'Error',frames:frames(err)});error({code:'CLIENT_EXCEPTION',title:'Aplikace narazila na problém',message:'Uložte prosím hlášení chyby. Potom aplikaci znovu načtěte.',actionLabel:'ZNOVU NAČÍST',action:'reload',show:options.canShow?options.canShow():options.host!==false});}
    if(root.addEventListener){
      root.addEventListener('resize',()=>{if(fitDialog)fitDialog();});
      if(root.visualViewport)root.visualViewport.addEventListener('resize',()=>{if(fitDialog)fitDialog();});
      root.addEventListener('error',runtimeError);root.addEventListener('unhandledrejection',runtimeError);
      root.addEventListener('online',()=>record('NETWORK','ONLINE'));root.addEventListener('offline',()=>record('NETWORK','OFFLINE'));
      root.addEventListener('pagehide',()=>{record('LIFECYCLE','PAGE_HIDE');persist();});root.addEventListener('pageshow',e=>record('LIFECYCLE','PAGE_SHOW',{cached:!!e.persisted}));
      root.document&&root.document.addEventListener('visibilitychange',()=>{record('LIFECYCLE',root.document.hidden?'BACKGROUND':'FOREGROUND');persist();});
    }
    record('BOOT','SUPPORT_READY',{version:VERSION,online:!(root.navigator&&root.navigator.onLine===false)});
    return {record,update,error,close,recovered,report,download,filename,persist,environment,importEvent:e=>record('','',{},e),history:()=>data.events.slice(),version:VERSION};
  }
  root.KovarnaSupport={create,details,clean,frames,version:VERSION};
})(window);
