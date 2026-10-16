import {imageError,CONDITIONS,validateInput} from './contract.mjs';
import {el,renderResult} from './render.js';
const $=id=>document.getElementById(id),rows=[];
let busy=false,blockedUntil=0,lastCache=null,lastInput=null,activeTerm=null,resultLevel='완전 초보',generation=0;
const termCache=new Map();
function status(text,error=false){$('status').textContent=text;$('status').className=`status ${error?'error':busy?'busy':''}`;}
for(const condition of CONDITIONS){const label=el('label'),check=el('input');check.type='checkbox';check.value=condition;label.append(check,document.createTextNode(condition));$('priorities').append(label);}
function allFiles(){return rows.flatMap(r=>r.images);}
function release(row){for(const image of row.images)URL.revokeObjectURL(image.url);row.images=[];}
function refresh(){rows.forEach((r,i)=>{r.title.textContent=`비교 대상 ${String(i+1).padStart(2,'0')}`;r.remove.disabled=rows.length<=2||busy;r.file.disabled=r.images.length>=2||busy;});$('add').disabled=rows.length>=4||busy;}
function addItem(){
  if(rows.length>=4)return;
  const row={images:[]},box=el('div',undefined,'item'),head=el('div',undefined,'item-head'),title=el('h3'),remove=el('button','대상 삭제');remove.type='button';head.append(title,remove);
  const nameLabel=el('label','대상 이름'),name=el('input');name.required=true;name.maxLength=80;name.placeholder='예: 중고 노트북 A';nameLabel.append(name);
  const textLabel=el('label','설명과 조건'),text=el('textarea');text.maxLength=4000;text.placeholder='가격, 사양, 이용 조건 등 원문을 붙여 넣어 주세요. (최대 4,000자)';textLabel.append(text);
  const fileLabel=el('label','사진·스크린샷 추가'),file=el('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.multiple=true;fileLabel.append(file);
  const list=el('div',undefined,'upload-list'),error=el('p',undefined,'file-error');error.setAttribute('role','alert');
  function displayImages(){list.replaceChildren();for(const image of row.images){const card=el('div',undefined,'upload-card'),preview=el('img');preview.alt=`${name.value||'비교 자료'}: ${image.file.name}`;preview.src=image.url;const clear=el('button','이 이미지 삭제');clear.type='button';clear.onclick=()=>{if(busy)return;URL.revokeObjectURL(image.url);row.images.splice(row.images.indexOf(image),1);displayImages();refresh();};preview.onerror=()=>{URL.revokeObjectURL(image.url);row.images=row.images.filter(x=>x!==image);error.textContent='이미지를 열 수 없습니다. 다른 이미지나 텍스트를 입력해 주세요.';displayImages();refresh();};card.append(preview,el('p',`${image.file.name} · ${(image.file.size/1024).toFixed(0)}KB`),clear);list.append(card);}}
  file.onchange=()=>{
    error.textContent='';const selected=[...file.files];file.value='';const errors=[];
    for(const chosen of selected){if(row.images.length>=2){errors.push('대상마다 이미지는 최대 2개입니다.');break;}if(allFiles().length>=6){errors.push('이미지는 전체 최대 6개입니다.');break;}
      const issue=imageError(chosen,allFiles().reduce((s,i)=>s+i.file.size,0));if(issue){errors.push(`${chosen.name}: ${issue}`);continue;}
      if(row.images.some(x=>x.file.name===chosen.name&&x.file.size===chosen.size&&x.file.lastModified===chosen.lastModified)){errors.push('같은 파일이 이미 추가되어 있습니다.');continue;}
      row.images.push({file:chosen,url:URL.createObjectURL(chosen)});
    }error.textContent=errors.join(' ');displayImages();refresh();
  };
  remove.onclick=()=>{if(busy||rows.length<=2)return;release(row);rows.splice(rows.indexOf(row),1);box.remove();refresh();};
  Object.assign(row,{box,title,name,text,file,remove});rows.push(row);box.append(head,nameLabel,textLabel,fileLabel,list,error);$('items').append(box);refresh();
}
function fileData(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({mimeType:file.type,data:String(reader.result).split(',')[1]});reader.onerror=()=>reject(new Error('이미지를 읽을 수 없습니다. 다시 선택해 주세요.'));reader.readAsDataURL(file);});}
async function gatherInput(change=''){
  return validateInput({purpose:$('purpose').value,budget:$('budget').value===''?null:Number($('budget').value),level:$('level').value,priorities:[...$('priorities').querySelectorAll('input:checked')].map(x=>x.value),custom:$('custom').value,change,consent:$('consent').checked,items:await Promise.all(rows.map(async r=>({name:r.name.value,text:r.text.value,images:await Promise.all(r.images.map(i=>fileData(i.file)))})))});
}
function lock(value){busy=value;for(const id of ['compare','recompare','ask-term','clear-all','clear-result','add'])$(id).disabled=value;for(const control of $('form').querySelectorAll('input,textarea,select,button'))control.disabled=value;$('change').disabled=value;refresh();}
async function signature(value){const buffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('');}
async function request(path,payload){
  if(Date.now()<blockedUntil)throw new Error(`요청이 잠시 중단되었습니다. 약 ${Math.ceil((blockedUntil-Date.now())/60000)}분 후 다시 이용해 주세요.`);
  const password=$('access-password').value;
  if(!password){document.querySelector('.access').open=true;$('access-password').focus();throw new Error('사이트 이용 암호를 입력해 주세요. Gemini API 키는 입력하지 마세요.');}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
  try{
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${password}`},body:JSON.stringify(payload),signal:controller.signal,cache:'no-store',credentials:'same-origin'});
    let data;try{data=await response.json();}catch{throw new Error('서버 응답을 읽지 못했습니다. 자동 재시도하지 않았습니다.');}
    if(!response.ok){if(response.status===429)blockedUntil=Date.now()+Math.max(1,Number(data.error?.retry_after)||60)*1000;throw new Error(data.error?.message||'분석 요청을 완료하지 못했습니다.');}return data;
  }catch(e){if(e.name==='AbortError')throw new Error('응답 시간이 초과되었습니다. 자동 재시도하지 않았습니다.');if(e instanceof TypeError)throw new Error('서버에 연결하지 못했습니다. 연결 상태를 확인해 주세요.');throw e;}finally{clearTimeout(timer);}
}
async function compare(change=''){
  if(busy||!$('form').reportValidity())return;lock(true);status('자료를 확인하고 있습니다…');
  try{
    const input=await gatherInput(change),key=await signature(input);let data,cached=false;
    if(lastCache?.key===key){data=lastCache.data;cached=true;}else{status('AI가 자료를 읽고 비교하고 있습니다. 최대 60초 정도 걸릴 수 있습니다…');data=await request('/api/compare',input);lastCache={key,data};}
    const previous=lastInput;lastInput=input;resultLevel=input.level;
    renderResult($('result-content'),data,input,openTerm,previous);$('result-title').textContent=data.result.comparison_title;$('result-meta').textContent=`${cached?'동일 입력의 현재 탭 결과 재사용 · AI 추가 호출 없음':'실제 AI API 응답'} · ${data.meta.model} · 외부 웹 검색 없음 · 이미지 인용은 원본 확인 필요`;
    $('results').hidden=false;status(cached?'같은 입력의 이전 결과를 다시 표시했습니다.':'비교가 완료되었습니다. 입력 근거와 확인이 필요한 정보를 함께 살펴보세요.');$('result-title').focus();$('results').scrollIntoView({behavior:'auto',block:'start'});
  }catch(e){status(e.message,true);}finally{lock(false);}
}
function openTerm(term){activeTerm=term;generation++;$('term-title').textContent=`${term.term}*`;$('term-content').replaceChildren();const dl=el('dl');for(const [name,key] of [['쉬운 뜻','easy_meaning'],['생활 속 비유','analogy'],['이 비교에서 중요한 이유','relevance'],['확인할 점','checks']])dl.append(el('dt',name),el('dd',term[key]));$('term-content').append(dl);$('term-question').value='';$('term-status').textContent='';$('term-answer').replaceChildren();if(!$('term-dialog').open)$('term-dialog').showModal();}
function clearResult(){generation++;lastCache=null;lastInput=null;activeTerm=null;termCache.clear();$('result-content').replaceChildren();$('results').hidden=true;$('change').value='';$('term-content').replaceChildren();$('term-answer').replaceChildren();$('term-dialog').close();status('결과를 지웠습니다. 입력 자료는 유지됩니다.');}
$('form').onsubmit=e=>{e.preventDefault();compare('');};$('recompare').onclick=()=>compare($('change').value);$('add').onclick=addItem;$('close-term').onclick=()=>{$('term-dialog').close();generation++;};$('term-dialog').addEventListener('cancel',()=>{generation++;});
$('term-form').onsubmit=async e=>{
  e.preventDefault();if(busy||!activeTerm)return;lock(true);const current=++generation;$('term-status').textContent='AI가 용어 질문을 확인하고 있습니다…';
  try{const payload={term:activeTerm,question:$('term-question').value,level:resultLevel,consent:$('consent').checked},key=await signature(payload);let data=termCache.get(key);if(!data){data=await request('/api/explain',payload);if(termCache.size>=5)termCache.clear();termCache.set(key,data);}if(current===generation){$('term-answer').replaceChildren(el('p',data.result.answer));for(const note of data.result.uncertainty_notes)$('term-answer').append(el('p',note,'hint'));$('term-status').textContent='답변을 확인해 주세요.';}}
  catch(error){if(current===generation)$('term-status').textContent=error.message;}finally{lock(false);}
};
$('clear-result').onclick=clearResult;
$('clear-all').onclick=()=>{if(busy)return;clearResult();for(const row of rows)release(row);rows.length=0;$('items').replaceChildren();$('form').reset();$('access-password').value='';addItem();addItem();status('입력과 결과, 이용 암호를 모두 지웠습니다.');};
addItem();addItem();
fetch('/api/status',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>{$('connection').textContent=data.ready?'AI 연결 설정이 준비되어 있습니다':'AI 연결 전 · API 계정 설정 대기';$('connection-detail').textContent=data.ready?'실제 호출 성공 여부는 분석 요청 시 확인됩니다. 무료 한도 초과 시 중단하며 자동 재시도하지 않습니다.':'입력 기능을 사용할 수 있습니다. API 키와 무료 계정 설정 전에는 AI 분석을 실행하지 않습니다.';}).catch(()=>{$('connection').textContent='API 서버에 연결하지 못했습니다';$('connection-detail').textContent='로컬 실행 안내에 따라 dev-server.mjs를 실행해 주세요. 파일 더블클릭이나 정적 서버만으로 AI를 사용할 수 없습니다.';});
