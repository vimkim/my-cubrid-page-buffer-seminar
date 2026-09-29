(() => {
if (!document.querySelector('#scenario')) return;

'use strict';
const ko = document.documentElement?.lang === 'ko';
const scenarios={
 cycle:{seq:[...'ABCDABCDABCD'],note:(ko ? "네 페이지를 같은 순서로 세 번 읽는다. 프레임 3개에서 첫 D와 다음 A를 차례로 살펴보자." : "Read four pages in the same order three times. With three frames, inspect the first D and the next A.")},
 locality:{seq:[...'ABCDCDCDCDCD'],note:(ko ? "첫 A/B 이후에는 C/D만 반복한다. 순환 사례에서 좋았던 MRU가 이 순서에서도 좋은지 비교한다." : "After A/B, only C/D repeat. Does MRU still help?")},
 hot_scan:{seq:'A B A X1 A B A X2 A B A X3 A B A X4'.split(' '),note:(ko ? "사용자 U는 A/B를 반복하고 사용자 S는 X1~X4를 한 번씩 읽는다. U,U,U,S 순서로 섞은 예시이며 병렬 실행 실험은 아니다." : "U repeats A/B while S scans X1 to X4. This is a prescribed interleaving, not a parallel runtime experiment.")},
 fits:{seq:[...'ABCABCABCABC'],note:(ko ? "페이지 세 개가 프레임 세 개에 모두 들어간다. 최초 적재 이후에 교체할 이유가 있는지 비교한다." : "Three pages fit in three frames. Inspect reuse after initial loading.")}
};
const labels={LRU:['LRU',(ko ? "가장 오래전에 접근한 기존 페이지를 교체" : "Evict the least recently accessed resident page")],MRU:['MRU',(ko ? "가장 최근에 접근한 기존 페이지를 교체" : "Evict the most recently accessed resident page")],OPT:[(ko ? "OPT · 미래를 앎" : "OPT \u00b7 knows the future"),(ko ? "다음 접근이 가장 먼 기존 페이지를 교체" : "Evict the resident page whose next access is farthest away")]};
function simulate(seq,capacity,policy){
 let buffer=[],misses=0,replacements=0;const out=[{buffer:[],misses:0,replacements:0,page:null,hit:false,victim:null}];
 seq.forEach((page,i)=>{
   const hit=buffer.includes(page);let victim=null;
   if(!hit){misses++;
     if(buffer.length===capacity){
       if(policy==='LRU')victim=buffer[buffer.length-1];
       else if(policy==='MRU')victim=buffer[0];
       else{let farthest=-1;for(const p of buffer){const next=seq.indexOf(p,i+1),distance=next===-1?Infinity:next;if(distance>farthest){farthest=distance;victim=p;}}}
       buffer=buffer.filter(p=>p!==victim);replacements++;
     }
   }else buffer=buffer.filter(p=>p!==page);
   buffer.unshift(page);out.push({buffer:[...buffer],misses,replacements,page,hit,victim});
 });return out;
}
let step=0;
const $=id=>document.getElementById(id);
function render(){
 const key=$('scenario').value,scenario=scenarios[key],seq=scenario.seq,cap=Number($('capacity').value);step=Math.max(0,Math.min(step,seq.length));
 $('scenario-note').textContent=scenario.note;
 $('trace').innerHTML=seq.map((p,i)=>`<span class="page-chip ${i===step-1?'current':i<step?'done':''}" aria-label="${i+1}: ${p}">${p}${key==='hot_scan'?`<small>${p.startsWith('X')?'S':'U'}</small>`:''}</span>`).join('');
 $('step').max=seq.length;$('step').value=step;$('progress').textContent=`${step} / ${seq.length}`;
 $('prev').disabled=step===0;$('reset').disabled=step===0;$('next').disabled=step===seq.length;$('last').disabled=step===seq.length;
 const finals=[];
 $('policies').innerHTML=Object.keys(labels).map(policy=>{
   const timeline=simulate(seq,cap,policy),s=timeline[step],end=timeline[timeline.length-1];finals.push(`${policy} ${end.misses}`);
   const status=step===0?(ko?'아직 접근하지 않음':'No access yet'):s.hit?`${s.page}: HIT · ${ko?'거주 페이지 재사용':'resident reuse'}`:`${s.page}: MISS · ${s.victim?`${s.victim} ${ko?'교체':'evicted'}`:(ko?'빈 프레임에 적재':'load into an empty frame')}`;
   return `<article class="policy" data-policy="${policy}"><h3>${labels[policy][0]}</h3><p class="rule">${labels[policy][1]}</p><div class="frames">${Array.from({length:cap},(_,i)=>{const p=s.buffer[i];return `<span class="frame ${p===s.page?'active':''} ${p?'':'empty'}">${p||'·'}</span>`;}).join('')}</div><div class="order">${ko?"최근 접근 ← → 오래된 접근":"Recent \u2190 \u2192 old"}</div><p class="status ${step?(s.hit?'hit':'miss'):''}">${status}</p><div class="metric"><span>${ko?"누적 miss":"Misses"}<b class="miss-count">${s.misses}</b></span><span>${ko?"누적 교체":"Replacements"}<b class="replace-count">${s.replacements}</b></span><span>${ko?"누적 hit":"Hits"}<b>${step-s.misses}</b></span></div><small>${ko?"전체 trace: miss":"Full trace: misses"} ${end.misses}, replacements ${end.replacements}</small></article>`;
 }).join('');
 $('summary').textContent=ko ? `프레임 ${cap}개 · ${seq.length}번 접근: ${finals.join(' / ')}. 빈 프레임 적재는 교체에서 제외한다.` : `${cap} frames · ${seq.length} accesses: ${finals.join(' / ')}. Replacement excludes loading empty frames.`;
}
$('scenario').addEventListener('change',()=>{step=0;render();});$('capacity').addEventListener('change',()=>{step=0;render();});
$('reset').addEventListener('click',()=>{step=0;render();});$('prev').addEventListener('click',()=>{step--;render();});$('next').addEventListener('click',()=>{step++;render();});$('last').addEventListener('click',()=>{step=scenarios[$('scenario').value].seq.length;render();});$('step').addEventListener('input',e=>{step=Number(e.target.value);render();});
const zoneStates=[
 {nodes:[['A',1],['B',1],['C',2],['D',2],['E',3],['F',3]],changed:[],detail:(ko ? "초기 상태: E는 zone 3에 있다. E를 재접근하고 boost 경로로 들어간다고 가정한다." : "Initially E is in zone 3. Assume its next access enters the boost path."),boundary:'bottom_1 = B / bottom_2 = D / bottom = F'},
 {nodes:[['E',1],['A',1],['B',1],['C',2],['D',2],['F',3]],changed:['E'],detail:(ko ? "E를 현재 위치에서 제거하고 top에 연결한다. zone 1은 3개, zone 1+2는 5개가 되어 임계치를 넘었다. 이 변경과 뒤의 재조정은 같은 LRU mutex 안에서 진행한다." : "Detach E and attach it at top. Zone 1 has three nodes and zones 1+2 have five. Movement and subsequent adjustment hold the same LRU mutex."),boundary:'bottom_1 = B / bottom_2 = D / bottom = F'},
 {nodes:[['E',1],['A',1],['B',1],['C',2],['D',3],['F',3]],changed:['D'],detail:(ko ? "adjust_zones: zone 2의 경계 D를 zone 3으로 내린다. zone 1+2는 4개가 된다. D의 리스트 위치는 그대로이며 zone·개수·후보 정보와 경계를 갱신한다." : "adjust_zones demotes boundary D to zone 3; zones 1+2 now contain four nodes. D stays in place while metadata and boundaries change."),boundary:'bottom_1 = B / bottom_2 = C / bottom = F'},
 {nodes:[['E',1],['A',1],['B',2],['C',2],['D',3],['F',3]],changed:['B'],detail:(ko ? "adjust_zone1: zone 1의 경계 B를 zone 2로 내린다. zone 1은 2개가 된다. E의 이동 하나가 D와 B의 추가 관리 작업을 일으켰다." : "adjust_zone1 demotes boundary B to zone 2. Zone 1 now has two nodes. Moving E caused additional work on D and B."),boundary:'bottom_1 = A / bottom_2 = C / bottom = F'}
];let zoneStep=0;
function renderZone(){const s=zoneStates[zoneStep];$('zone-row').innerHTML=s.nodes.map(([p,z],i)=>`${i?'<span class="arrow" aria-hidden="true">⇄</span>':''}<span class="zone-node z${z} ${s.changed.includes(p)?'changed':''}"><b>${p}</b><small>zone ${z}</small></span>`).join('');$('zone-row').setAttribute('aria-label',s.nodes.map(([p,z])=>`${p} zone ${z}`).join(', '));$('zone-detail').textContent=s.detail;$('zone-boundary').textContent=s.boundary;$('zone-progress').textContent=`${zoneStep} / 3`;$('zone-prev').disabled=zoneStep===0;$('zone-next').disabled=zoneStep===3;}
$('zone-prev').addEventListener('click',()=>{zoneStep--;renderZone();});$('zone-next').addEventListener('click',()=>{zoneStep++;renderZone();});
window.PBLab={simulate,scenarios,zoneStates};render();renderZone();

})();
