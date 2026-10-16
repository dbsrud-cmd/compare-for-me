export const LEVELS = ['완전 초보', '기본 이해', '자세히'];
export const CONDITIONS = ['가격', '성능', '가성비', '초보자 사용 편의', '장기 사용', '낮은 유지비'];
export const LIMITS = Object.freeze({items: 4, imagesPerItem: 2, images: 6, imageBytes: 2*1024*1024, totalImageBytes: 6*1024*1024, requestBytes: 9*1024*1024});
export class AppError extends Error {
  constructor(code, message, status = 400, retryAfter = 0) { super(message); Object.assign(this, {code, status, retryAfter}); }
}
export function fail(message) { throw new AppError('INPUT_INVALID', message); }
export function string(value, max, label, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(`${label} 입력을 확인해 주세요. (최대 ${max}자)`);
  return value.trim();
}
export function imageError(file, others = 0) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return 'JPEG, PNG, WebP 이미지만 선택해 주세요.';
  if (file.size <= 0 || file.size > LIMITS.imageBytes) return '이미지는 0바이트보다 크고 2MB 이하여야 합니다.';
  if (others + file.size > LIMITS.totalImageBytes) return '이미지 전체 크기는 6MB 이하여야 합니다.';
  return '';
}
function verifyImage(image) {
  if (!image || typeof image !== 'object') fail('이미지 형식을 확인해 주세요.');
  const data = image.data;
  if (typeof data !== 'string' || data.length > Math.ceil(LIMITS.imageBytes/3)*4 || data.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) fail('이미지 데이터 형식을 확인해 주세요.');
  let decoded; try { decoded = atob(data); } catch { fail('이미지를 다시 선택해 주세요.'); }
  const issue = imageError({type:image.mimeType, size:decoded.length}); if(issue) fail(issue);
  const bytes = Uint8Array.from(decoded.slice(0,16), c => c.charCodeAt(0));
  const png = [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = decoded.startsWith('RIFF') && decoded.slice(8,12) === 'WEBP';
  if (!({'image/png':png,'image/jpeg':jpg,'image/webp':webp})[image.mimeType]) fail('파일의 실제 형식이 선택한 이미지 형식과 다릅니다.');
  return {mimeType:image.mimeType, data, size:decoded.length};
}
export function validateInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('입력 형식을 확인해 주세요.');
  if (raw.consent !== true) fail('자료의 AI 전송 안내에 동의해 주세요.');
  const purpose = string(raw.purpose,1000,'비교 목적');
  const custom = string(raw.custom,500,'추가 조건',true);
  const change = string(raw.change,500,'변경 조건',true);
  if (!LEVELS.includes(raw.level)) fail('설명 난이도를 선택해 주세요.');
  if (raw.budget !== null && (!Number.isSafeInteger(raw.budget) || raw.budget < 0 || raw.budget > 1000000000)) fail('예산은 0~10억 원 사이의 정수로 입력해 주세요.');
  if (!Array.isArray(raw.priorities) || raw.priorities.length > CONDITIONS.length || raw.priorities.some(x => !CONDITIONS.includes(x)) || new Set(raw.priorities).size !== raw.priorities.length) fail('중요 조건을 확인해 주세요.');
  if (!Array.isArray(raw.items) || raw.items.length < 2 || raw.items.length > LIMITS.items) fail('비교 대상은 2~4개여야 합니다.');
  let totalBytes = 0, totalImages = 0;
  const items = raw.items.map((item,index) => {
    if(!item || typeof item !== 'object') fail('비교 대상 형식이 잘못되었습니다.');
    const name = string(item.name,80,'대상 이름'), text = string(item.text,4000,'대상 설명',true);
    if (!Array.isArray(item.images) || item.images.length > LIMITS.imagesPerItem) fail('대상마다 이미지는 최대 2개입니다.');
    const images = item.images.map((image,i) => { const verified = verifyImage(image); totalBytes += verified.size; totalImages++; return {...verified, id:`i${index+1}-image${i+1}`}; });
    if (!text && !images.length) fail(`${name}의 설명이나 이미지를 넣어 주세요.`);
    return {id:`i${index+1}`, name, text, images};
  });
  if (totalBytes > LIMITS.totalImageBytes || totalImages > LIMITS.images) fail('이미지는 전체 6개·6MB 이하여야 합니다.');
  return {purpose,custom,change,level:raw.level,budget:raw.budget,priorities:raw.priorities,items,consent:true};
}
