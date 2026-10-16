export const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
function wordChar(c){return !!c && /[\p{L}\p{N}_]/u.test(c);}
export function richText(text,terms,onTerm) {
  const fragment=document.createDocumentFragment(); let cursor=0;
  const names=[...terms].sort((a,b)=>b.term.length-a.term.length),lower=text.toLocaleLowerCase();
  while(cursor<text.length) {
    let found=null;
    for(const term of names) {
      let index=lower.indexOf(term.term.toLocaleLowerCase(),cursor);
      while(index!==-1) {
        const latin=/^[A-Za-z0-9_]+$/.test(term.term);
        if(!latin || ((!wordChar(text[index-1]) || /[가-힣]/.test(text[index-1])) && (!wordChar(text[index+term.term.length]) || /[가-힣]/.test(text[index+term.term.length])))) break;
        index=lower.indexOf(term.term.toLocaleLowerCase(),index+1);
      }
      if(index!==-1 && (!found || index<found.index)) found={term,index};
    }
    if(!found){fragment.append(document.createTextNode(text.slice(cursor)));break;}
    fragment.append(document.createTextNode(text.slice(cursor,found.index)));
    const button=el('button',`${text.slice(found.index,found.index+found.term.term.length)}*`,'term-link');button.type='button';button.setAttribute('aria-label',`${found.term.term} 쉬운 설명 열기`);button.onclick=()=>onTerm(found.term);fragment.append(button);cursor=found.index+found.term.term.length;
  }
  return fragment;
}
export function renderResult(container,data,input,onTerm,previous) {
  container.replaceChildren();const {result,sources}=data,terms=result.difficult_terms,sourceMap=new Map(sources.map(s=>[s.id,s]));
  const rich=text=>richText(text,terms,onTerm);
  function paragraph(text){const p=el('p');p.append(rich(text));return p;}
  function evidence(entries) {
    if(!entries.length)return document.createDocumentFragment();
    const details=el('details',undefined,'evidence');details.append(el('summary','입력 근거 보기'));
    for(const e of entries){const source=sourceMap.get(e.source_id),label=source?.type==='image'?`${e.source_id} · 이미지에서 AI가 읽은 내용 (원본 확인 필요)`:`${e.source_id} · 입력 원문 인용`;details.append(el('p',label));const quote=el('blockquote');quote.append(rich(e.quote));details.append(quote);}return details;
  }
  function list(title,values){if(!values.length)return;container.append(el('h3',title));const ul=el('ul');for(const value of values){const li=el('li');li.append(rich(value));ul.append(li);}container.append(ul);}
  const chosen=result.items.find(x=>x.id===result.recommendation.item_id),recommendation=el('div',undefined,'recommendation');recommendation.append(el('h3',chosen?`내 조건에 따른 추천: ${chosen.name}`:'정보가 부족해 추천을 보류했어요'),paragraph(result.recommendation.summary));
  for(const reason of result.recommendation.reasons){const box=el('div');box.append(paragraph(reason.text),evidence(reason.evidence));recommendation.append(box);}container.append(recommendation);
  const snapshot=value=>`목적: ${value.purpose}\n예산: ${value.budget===null?'지정하지 않음':value.budget.toLocaleString('ko-KR')+'원'}\n중요 조건: ${[...value.priorities,value.custom].filter(Boolean).join(', ')||'지정하지 않음'}\n설명: ${value.level}\n변경 조건: ${value.change||'없음'}`;
  const conditions=el('details');conditions.append(el('summary','이번 결과의 조건 확인'),el('p',snapshot(input),'conditions'));if(previous)conditions.append(el('h4','직전 결과의 조건'),el('p',snapshot(previous),'conditions'));container.append(conditions);
  container.append(el('h3','대상별 핵심 요약'));
  for(const item of result.items){const card=el('div',undefined,'result-card');card.append(el('h3',item.name),paragraph(item.summary));for(const [label,claims] of [['장점',item.pros],['단점',item.cons]]){card.append(el('h4',label));if(!claims.length)card.append(paragraph('제공 자료에서 판단할 정보가 충분하지 않습니다.'));for(const claim of claims)card.append(paragraph(claim.text),evidence(claim.evidence));}container.append(card);}
  container.append(el('h3','같은 기준으로 비교하기'));
  const wrap=el('div',undefined,'table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','항목별 비교표, 가로로 스크롤할 수 있습니다');const table=el('table');table.append(el('caption','제공 자료 기준 비교 · 확인 필요와 추론을 구분해 읽어 주세요.'));
  const head=el('thead'),tr=el('tr'),criterion=el('th','비교 기준');criterion.scope='col';tr.append(criterion);for(const item of input.items){const th=el('th',item.name);th.scope='col';tr.append(th);}head.append(tr);table.append(head);
  const tbody=el('tbody');for(const row of result.comparison_rows){const tr=el('tr'),th=el('th');th.scope='row';th.append(rich(row.label));tr.append(th);for(const item of input.items){const cell=row.cells.find(x=>x.item_id===item.id),td=el('td');td.append(rich(cell.value));if(cell.status==='inferred')td.append(el('p','조건부 추론','hint'));td.append(evidence(cell.evidence));tr.append(td);}tbody.append(tr);}table.append(tbody);wrap.append(table);container.append(wrap);
  list('누락된 정보 · 확인 필요',result.missing_information);list('주의할 점과 불확실성',result.uncertainty_notes);list('추가로 확인하면 좋은 질문',result.follow_up_questions);
  container.append(el('h3','어려운 용어, 쉽게 이해하기'));const termList=el('div',undefined,'term-list');for(const term of terms){const button=el('button',`${term.term}*`);button.type='button';button.onclick=()=>onTerm(term);termList.append(button);}if(!terms.length)termList.append(el('p','AI가 별도 설명이 필요한 용어를 찾지 못했습니다.'));container.append(termList);
  const original=el('details');original.append(el('summary','내가 입력한 텍스트 다시 보기'));for(const item of input.items){original.append(el('h4',item.name),paragraph(item.text||'텍스트 없이 이미지만 입력했습니다.'));if(item.images.length)original.append(el('p',`첨부 이미지 ${item.images.length}개 · 원본은 위 입력 영역에서 확인하세요.`,'hint'));}container.append(original);
}
