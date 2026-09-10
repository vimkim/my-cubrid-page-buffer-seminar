// One-time migration helper: emit apply_patch input; never a site build dependency.
import fs from 'node:fs';
import path from 'node:path';
const file=process.argv[2];
const original=fs.readFileSync(file,'utf8');
const language=file.split('/')[0];
const ko=language==='ko';
const nested=file.split('/').length===3;
const root=nested?'../../':'../';
const home=nested?'../':'';
const rows=JSON.parse(fs.readFileSync('.scratch/seminar-curriculum/lectures.json','utf8'));
const row=rows.find(r=>file.endsWith('/lessons/'+r[2]));
const plain=s=>s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const t=(en,kr)=>ko?kr:en;
let html=original;
const phases=[['Foundations','기초 모델'],['Acquisition and ownership','획득과 소유권'],['Mutation and durability','변경과 durability'],['Replacement','교체와 진행'],['Concurrency','동시성'],['Recovery and specialized behavior','복구와 특수 경로'],['Maintainer integration','Maintainer 통합'],['Cross-engine perspective','다른 엔진과의 비교']];
function shell(title,body){
 const counterpart=(nested?'../../':'../')+(ko?'en':'ko')+'/'+file.split('/').slice(1).join('/');
 return `<!doctype html>\n<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="${root}assets/teach-course.css"></head><body>\n<nav class="language-switcher" data-language-switcher aria-label="${t('Language','언어')}"><span aria-current="page">${language.toUpperCase()}</span><a href="${counterpart}" hreflang="${ko?'en':'ko'}" lang="${ko?'en':'ko'}">${ko?'EN':'KO'}</a></nav>\n<main class="course-shell"><header class="hero"><div class="eyebrow">CUBRID PAGE BUFFER · f799e05</div><h1>${title}</h1></header>${body}</main></body></html>\n`;
}
function syllabus(){return phases.map((phase,i)=>`<section class="curriculum-phase" id="phase-${i+1}"><p class="eyebrow">${String(i+1).padStart(2,'0')}</p><h2>${phase[ko?1:0]}</h2><ol>${rows.filter(r=>r[1]===i).map(r=>`<li><a href="${home}lessons/${r[2]}">Lecture ${r[0]} — ${r[ko?4:3]}</a><small>${r[ko?6:5]}</small></li>`).join('\n')}</ol></section>`).join('\n');}
const referenceTitles={
 'course-learning-path.html':['Curriculum syllabus','커리큘럼 안내'],
 'core-synthesis-studio.html':['Synthesis workshop','통합 워크숍'],
 'presentation-rehearsal-card.html':['Technical-defense rubric','Technical defense 평가 기준'],
 'presentation-spine.html':['Page-journey recap','Page journey 요약'],
 'expected-team-questions.html':['Questions and explanations','질문과 해설']
};
const name=path.basename(file);
if(name==='index.html'){
 const refs=JSON.parse(fs.readFileSync('teaching-pages.json','utf8')).pages.filter(p=>p.path.startsWith('reference/')&&!p.path.endsWith('course-coverage-matrix.html'));
 const library=refs.map(p=>{let title=referenceTitles[path.basename(p.path)]?.[ko?1:0];if(!title){const doc=fs.readFileSync(language+'/'+p.path,'utf8');title=plain(doc.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]||p.path);}
 return `<li><a href="${p.path}">${title}</a></li>`;}).join('\n');
 html=shell(t('From one page to the whole Module','페이지 하나에서 모듈 전체로.'),`<p class="lede">${t('Follow acquisition, ownership, mutation, flush, and frame reuse. Connect the source transitions to the decisions a maintainer makes.','페이지 획득, 소유권, 변경, flush와 frame 재사용을 따라갑니다. 소스의 상태 전이를 maintainer의 판단과 연결합니다.')}</p><a class="primary-link" href="lessons/${rows[0][2]}">${t('Begin with the page journey','Page journey부터 시작하기')} →</a><div class="curriculum-layout"><aside class="curriculum-overview"><h2>${t('Concepts, source, and judgment','개념, 소스, 그리고 판단.')}</h2><p>${t('For C/C++ engineers familiar with buffer pools and WAL. Start with 25 lectures, normally 90 minutes each, and continue until the mechanisms connect.','Buffer pool과 WAL 기초를 아는 C/C++ 엔지니어를 위한 자료입니다. 25개 강의로 시작하며 강의당 기본 90분을 사용합니다. 메커니즘이 연결될 때까지 이어집니다.')}</p><p>${t('Use the same pages during the seminar and afterward. Scenarios, source traces, runtime probes, and technical defense build evidence of understanding.','세미나와 이후 복습에서 같은 자료를 사용합니다. 시나리오, source trace, runtime probe, technical defense를 통해 이해를 확인합니다.')}</p><a href="reference/course-learning-path.html">${t('Curriculum and practice','커리큘럼과 실습')} →</a></aside><div class="curriculum-phases">${syllabus()}</div></div><section class="section curriculum-library" id="library"><p class="eyebrow">TOPIC LIBRARY</p><h2>${t('Start from your question','질문에서 출발하기')}</h2><ul>${library}</ul><p><a href="../page-buffer-teaching-material.md">${t('Canonical Maintainer Guide','Canonical Maintainer Guide')} ↗</a></p></section>`);
}
if(name==='course-learning-path.html'){
 html=shell(t('Curriculum syllabus','커리큘럼 안내'),`<section class="section"><h2>${t('One mechanism at a time; the whole Module in view','하나의 메커니즘에서 모듈 전체로')}</h2><p>${t('Follow the conceptual order below. Lecture identifiers remain stable even when the order changes. Each lecture combines explanation, source tracing, participant reasoning, and questions.','아래의 개념 순서로 진행합니다. 진행 순서가 바뀌어도 강의 식별자는 유지합니다. 각 강의는 설명, source tracing, 함께 생각하기, 질문으로 구성됩니다.')}</p></section><div class="curriculum-phases">${syllabus()}</div><section class="section" id="practice"><h2>${t('Practice between lectures','강의 사이의 실습')}</h2><p>${t('Trace one source transition, record its owner and invariant, and predict a counterexample. Revisit connections in the synthesis workshop. Use a reversible probe when the question requires runtime evidence.','소스 전이 하나를 추적해 owner와 invariant를 기록하고 반례를 예상합니다. 통합 워크숍에서 연결을 다시 확인합니다. Runtime evidence가 필요한 질문에는 되돌릴 수 있는 probe를 사용합니다.')}</p><p><a href="core-synthesis-studio.html">${t('Synthesis workshop','통합 워크숍')}</a> · <a href="../../questions/applied-exercises.md">${t('Applied exercises and experiment boundaries','실습과 실험의 경계')}</a> · <a href="presentation-rehearsal-card.html">${t('Final technical-defense rubric','최종 technical defense 평가 기준')}</a></p></section><section class="section" id="completion"><h2>${t('Evidence of understanding','이해를 확인하는 근거')}</h2><p>${t('Completion connects source traces, concurrency and failure scenarios, symptom diagnosis, and a reviewed change-impact and verification plan. The presenter or team keeps individual records outside this site.','과정 완료 시 source trace, 동시 실행과 실패 시나리오, 증상 진단, 검토된 변경 영향 및 검증 계획을 연결합니다. 개인별 기록은 발표자나 팀이 이 사이트 밖에서 관리합니다.')}</p></section>`);
}
if(name==='course-coverage-matrix.html'){
 html=shell(t('Curriculum syllabus moved','커리큘럼 안내로 이동'),`<section class="section"><p><a href="course-learning-path.html">${t('Open the curriculum syllabus','커리큘럼 안내 열기')} →</a></p></section>`).replace('</head>','<meta http-equiv="refresh" content="0; url=course-learning-path.html"></head>');
}
if(row){
 const title=`Lecture ${row[0]} — ${row[ko?4:3]}`;
 html=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${title}</title>`).replace(/<h1[^>]*>[\s\S]*?<\/h1>/,`<h1>${row[ko?4:3]}</h1>`);
 html=html.replace(/(<header\b[\s\S]*?<div class="eyebrow">)[\s\S]*?(<\/div>)/,`$1LECTURE ${row[0]} / ${phases[row[1]][ko?1:0]}$2`);
 html=html.replace(/(<header\b[\s\S]*?<h1[^>]*>[\s\S]*?<\/h1>\s*)<p[^>]*>[\s\S]*?<\/p>/,`$1<p>${row[ko?6:5]}</p>`);
}
// Convert the existing prompts and authored model answers without touching technical claims.
html=html.replace(/<div class="quiz"((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<div class="feedback"[^>]*><\/div>\s*<\/div>/g,(_,attrs,body)=>{
 const model=attrs.match(/\bdata-model="([^"]*)"/)?.[1];
 let content=body.replace(/<textarea\b[\s\S]*?<\/textarea>/g,'').replace(/<button\b[\s\S]*?<\/button>/g,'');
 const answers=[];
 content=content.replace(/<p>\s*<strong>(?:Model[^<]*|모범[^<]*|권장[^<]*)<\/strong>([\s\S]*?)<\/p>/gi,(_,text)=>{answers.push(text.trim());return '';});
 const explanation=answers.length?answers.join('</p><p>'):model;
 if(!explanation) throw Error('Missing model answer: '+file);
 return `<div class="quiz" data-audience-checkpoint>${content}<details class="answer-disclosure"><summary>${t('Open the explanation','설명 펼치기')}</summary><p>${explanation}</p></details></div>`;
});
html=html.replace(/<script\b[^>]*teach-retrieval\.js[^>]*><\/script>\s*/g,'');
// Agent handoffs and coverage-detector commentary have no participant-facing role.
html=html.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/g,(all,body)=>/paste[^.]*chat|into (?:the )?chat|I will (?:check|assess|record)|automatic check|automatic detector|vocabulary detector|local coverage button|채팅|chat에|chat으로|teaching agent|자동 (?:검사|확인)|자동 check|coverage button|coverage detector|키워드.*(?:검사|확인)|어휘.*(?:감지|검사)/i.test(body)?'':all);
html=html.replace(/<footer\b[^>]*>([\s\S]*?)<\/footer>/g,(all,body)=>/teaching agent|Ask whenever|언제든/.test(body)?'':all);
html=html.replace(/<span class="status(?: [^"]*)?">[\s\S]*?<\/span>/g,'');
// Visible wording only: paths, IDs, source snippets and machine-readable invariants stay stable.
html=html.split(/(<[^>]+>)/).map((part,i)=>i%2?part:part
 .replace(/\bLessons\b/g,'Lectures').replace(/\bLesson\b/g,'Lecture').replace(/\blessons\b/g,'lectures').replace(/\blesson\b/g,'lecture')
 .replace(/Course home/g,'Curriculum').replace(/Course 홈/g,'커리큘럼')
 .replace(/After your teach-back, continue to /g,'Continue to ').replace(/teach-back 후 /g,'').replace(/teach-back|Teach-back|Teach back|teach back/g,t('Pause and reason','함께 생각하기'))
 .replace(/Retrieval practice|Retrieval task|Closed-book retrieval/g,t('Pause and reason','함께 생각하기'))
 .replace(/Your task:/g,'Consider:').replace(/할 일:/g,'생각할 점:')
 .replace(/Print for live explanation/g,'Page journey').replace(/첫머리에 제시할 contract/g,'Module contract')
 .replace(/Say what the Module buys the caller/g,'The Module’s contract with the caller').replace(/Speak evidence-aware English/g,'Evidence boundaries')
 .replace(/Teach the executable conditions and keep anomalies visible/g,'Executable conditions and source anomalies')
 .replace(/Optional comparison/g,'Cross-engine comparison').replace(/Optional deep comparison/g,'Cross-engine replacement').replace(/선택 심화 비교/g,'엔진별 심화 비교').replace(/선택 비교/g,'엔진별 비교')
 .replace(/Course learning path|course learning path/g,'Curriculum syllabus').replace(/Core synthesis studio/g,'Synthesis workshop')
 ).join('');
// Preserve reference technical tables, replacing their coaching frame.
if(referenceTitles[name]){
 const title=referenceTitles[name][ko?1:0];html=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${title}</title>`).replace(/<h1[^>]*>[\s\S]*?<\/h1>/,`<h1>${title}</h1>`);
}
if(name==='core-synthesis-studio.html'){
 html=html.replace(/<header[\s\S]*?<\/header>/,`<header class="hero"><div class="eyebrow">SYNTHESIS WORKSHOP</div><h1>${t('Connect the page journey','Page journey 연결하기')}</h1><p>${t('Connect ownership, mutation, propagation, replacement, and latch waiting in one explanation. Compare it with the model and follow the evidence where questions remain.','Ownership, 변경, 전파, replacement, latch 대기를 하나의 설명으로 연결합니다. 모델과 비교하고 남은 질문은 근거를 따라 확인합니다.')}</p></header>`);
 const matches=[...html.matchAll(/<section class="section">[\s\S]*?<\/section>/g)];
 if(matches.length>=5){html=html.replace(matches[0][0],`<section class="section"><h2>${t('One connected scenario','하나로 연결된 시나리오')}</h2><p>${t('Start with a caller requesting a page. Follow its ownership and changes through flush and reuse; add a concurrent waiter and an exceptional return. State which conclusions come from source and which need an experiment.','Caller가 page를 요청하는 상황에서 시작합니다. Ownership과 변경을 flush와 재사용까지 따라가고, 동시에 대기하는 요청과 예외 반환을 더합니다. 소스로 확인한 결론과 실험이 필요한 결론을 구분합니다.')}</p></section>`);
 html=html.replace(matches.at(-1)[0],`<section class="section"><h2>${t('Continue the investigation','이어서 확인하기')}</h2><p><a href="course-learning-path.html">${t('Curriculum syllabus','커리큘럼 안내')}</a> · <a href="../../questions/applied-exercises.md">${t('Applied exercises','실습')}</a> · <a href="presentation-rehearsal-card.html">${t('Technical-defense rubric','Technical defense 평가 기준')}</a></p></section>`);}
}
if(name==='presentation-rehearsal-card.html') html=html.replace(/<h2>Feedback receipt<\/h2>/,'<h2>Team review record</h2>').replace(/Next spaced retrieval date/g,'Next question to investigate');
// Remove coverage-matrix navigation, retaining the compatibility page itself.
html=html.replace(/<a\b[^>]*href="[^"]*course-coverage-matrix\.html"[^>]*>[\s\S]*?<\/a>/g,'');
const controls=`<nav class="presentation-controls" data-presentation-controls data-present-label="${t('Presentation mode','발표 모드')}" data-read-label="${t('Reading mode','읽기 모드')}" hidden aria-label="${t('Presentation controls','발표 제어')}"><button type="button" data-presentation-toggle aria-pressed="false">${t('Presentation mode','발표 모드')}</button><button type="button" data-section-previous>${t('Previous section','이전 절')}</button><output aria-live="polite"></output><button type="button" data-section-next>${t('Next section','다음 절')}</button></nav>`;
const top=`<a class="skip-link" href="#seminar-content">${t('Skip to content','본문으로 이동')}</a><header class="seminar-top"><strong>CUBRID / PAGE BUFFER</strong><nav aria-label="${t('Curriculum navigation','커리큘럼 탐색')}"><a data-curriculum-link href="${home}reference/course-learning-path.html">${t('Curriculum','커리큘럼')}</a><a data-library-link href="${home}index.html#library">${t('Topic library','자료 찾기')}</a></nav></header>`;
html=html.replace('</head>',`<link rel="stylesheet" href="${root}assets/seminar.css"><script defer src="${root}assets/seminar.js"></script></head>`).replace(/<body>/,`<body data-seminar>${top}`).replace(/<main class="course-shell">/,'<main class="course-shell" id="seminar-content">').replace('</body>',controls+'\n</body>');
// Every lecture follows syllabus order; older in-body links remain contextual references.
if(row){const i=rows.indexOf(row);const links=[i>0?`<a rel="prev" href="${rows[i-1][2]}">← Lecture ${rows[i-1][0]} · ${rows[i-1][ko?4:3]}</a>`:'',i<rows.length-1?`<a rel="next" href="${rows[i+1][2]}">Lecture ${rows[i+1][0]} · ${rows[i+1][ko?4:3]} →</a>`:`<a href="../reference/presentation-rehearsal-card.html">${t('Technical-defense rubric','Technical defense 평가 기준')} →</a>`].join('');html=html.replace('</main>',`<nav class="lecture-navigation" data-lecture-nav aria-label="${t('Lecture sequence','강의 순서')}">${links}</nav></main>`);}
html=html.replace(/<table\b([\s\S]*?)<\/table>/g,'<div class="table-scroll"><table$1</table></div>');
if(html===original)process.exit();
process.stdout.write(`*** Begin Patch\n*** Update File: ${file}\n@@\n`+original.trimEnd().split('\n').map(l=>'-'+l).join('\n')+'\n'+html.trimEnd().split('\n').map(l=>'+'+l).join('\n')+'\n*** End Patch\n');
