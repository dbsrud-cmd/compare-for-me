import { AppError } from './contract.mjs';
const str = (maxLength=800) => ({type:'string',minLength:1,maxLength});
const arr = (items,maxItems=8,minItems=0) => ({type:'array',items,maxItems,minItems});
const obj = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const evidence = obj({source_id:str(30),quote:str(500)});
const evidenceList = arr(evidence,4);
const supported = obj({text:str(),evidence:evidenceList});
export const termSchema = obj({term:str(50),easy_meaning:str(),analogy:str(),relevance:str(),checks:str()});
export const resultSchema = obj({
  comparison_title:str(160),
  items:arr(obj({id:str(8),name:str(80),summary:str(),pros:arr(supported,4),cons:arr(supported,4)}),4,2),
  comparison_rows:arr(obj({label:str(80),cells:arr(obj({item_id:str(8),value:str(400),status:{type:'string',enum:['known','inferred','unknown']},evidence:evidenceList}),4,2)}),12,1),
  recommendation:obj({item_id:{type:['string','null'],maxLength:8},summary:str(),reasons:arr(supported,5)}),
  missing_information:arr(str(),12),follow_up_questions:arr(str(),8),uncertainty_notes:arr(str(),8),
  difficult_terms:arr(termSchema,12)
});
export const explanationSchema = obj({answer:str(2500),uncertainty_notes:arr(str(),5)});
function invalid() { throw new AppError('AI_INVALID','AI 응답 형식이나 근거를 검증하지 못했습니다. 결과를 표시하지 않았습니다.',502); }
export function validateSchema(value,schema) {
  if(schema.type === 'object') {
    if(!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    if(Object.keys(value).some(k => !Object.hasOwn(schema.properties,k))) invalid();
    for(const key of schema.required) { if(!Object.hasOwn(value,key)) invalid(); validateSchema(value[key],schema.properties[key]); }
  } else if(schema.type === 'array') {
    if(!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) invalid();
    value.forEach(v => validateSchema(v,schema.items));
  } else {
    if(value === null && Array.isArray(schema.type) && schema.type.includes('null')) return;
    if(typeof value !== 'string' || value.length > schema.maxLength || (schema.minLength && !value.trim())) invalid();
    if(schema.enum && !schema.enum.includes(value)) invalid();
  }
  return value;
}
export function sourcesFor(input) {
  const sources = [{id:'purpose',item_id:null,type:'text',text:input.purpose},{id:'custom',item_id:null,type:'text',text:input.custom},{id:'change',item_id:null,type:'text',text:input.change},{id:'budget',item_id:null,type:'text',text:input.budget === null ? '' : String(input.budget)},{id:'priorities',item_id:null,type:'text',text:input.priorities.join(', ')}];
  for(const item of input.items) {
    sources.push({id:`${item.id}-name`,item_id:item.id,type:'text',text:item.name},{id:`${item.id}-text`,item_id:item.id,type:'text',text:item.text});
    for(const image of item.images) sources.push({id:image.id,item_id:item.id,type:'image',text:'이미지에서 AI가 읽은 내용: 직접 원본을 확인하세요.'});
  }
  return sources;
}
export function validateResult(value,input) {
  validateSchema(value,resultSchema);
  const ids = input.items.map(x=>x.id), sources = new Map(sourcesFor(input).map(x=>[x.id,x]));
  if(value.items.length !== ids.length || new Set(value.items.map(x=>x.id)).size !== ids.length || value.items.some(x=>!ids.includes(x.id))) invalid();
  for(const item of value.items) if(item.name !== input.items.find(x=>x.id===item.id).name) invalid();
  function checkEvidence(list,itemId=null,required=false) {
    if(required && !list.length) invalid();
    for(const e of list) {
      const source = sources.get(e.source_id);
      if(!source || (itemId && source.item_id && source.item_id !== itemId)) invalid();
      if(source.type === 'text' && !source.text.includes(e.quote)) invalid();
    }
  }
  for(const item of value.items) for(const claim of [...item.pros,...item.cons]) checkEvidence(claim.evidence,item.id,true);
  for(const row of value.comparison_rows) {
    if(row.cells.length !== ids.length || new Set(row.cells.map(x=>x.item_id)).size !== ids.length) invalid();
    for(const cell of row.cells) {
      if(!ids.includes(cell.item_id)) invalid();
      checkEvidence(cell.evidence,cell.item_id,cell.status !== 'unknown');
      if(cell.status === 'unknown' && (cell.value !== '확인 필요' || cell.evidence.length)) invalid();
    }
  }
  if(value.recommendation.item_id !== null && !ids.includes(value.recommendation.item_id)) invalid();
  if(value.recommendation.item_id !== null && !value.recommendation.reasons.length) invalid();
  for(const reason of value.recommendation.reasons) checkEvidence(reason.evidence,null,true);
  const termNames = value.difficult_terms.map(t=>t.term.toLocaleLowerCase());
  if(new Set(termNames).size !== termNames.length || value.difficult_terms.some(t=> /[*\r\n]/.test(t.term))) invalid();
  return value;
}
