(function(root){
  'use strict';
  var PB=root.PB,active=null,timer=null;
  var intro=[
    {image:'intro-haneul.webp',name:'하늘',text:'저는 하늘이에요. 대학교에 가야 하는데, 오늘은 얼마나 기다릴까요?'},
    {image:'intro-narae.webp',name:'나래',text:'저는 나래예요. 병원에 다녀와야 해요. 돌아오는 버스도 있겠죠?'},
    {image:'intro-jun.webp',name:'준',text:'저는 준이에요. 기차에서 내려 일터까지, 아직 한 번 더 가야 해요.'},
    {image:'intro-village.webp',name:'솔잎마을의 AI',text:'솔잎마을에는 서로 다른 하루를 살아가는 사람들이 있습니다. 내가 할 일은 효율적인 노선을 만들고, 누구도 이동에서 소외되지 않게 돕는 것. 모두가 볼일을 마치고 돌아올 수 있도록 첫 노선을 그려 봅시다.'}
  ];
  var sol=[{image:'interlude-sol.webp',name:'솔',text:'저는 솔이에요. 새로 이사 왔어요. 여기서도 기차역에 갈 수 있을까요? 저녁에 돌아오는 버스도 있으면 좋겠어요.'}];
  var baseball=[
    {image:'interlude-cheer.webp',fallback:'intro-village.webp',name:'유나 · 치어리더',text:'저는 유나예요. 오늘 오후에는 종합운동장에서 치어리더로 일해요. 경기가 끝나면 친구 집으로 집들이를 가기로 했어요.'},
    {image:'interlude-cheer.webp',fallback:'intro-village.webp',name:'다은 · 야구 팬',text:'저는 다은이에요. 유나와 터미널에서 함께 왔어요. 오늘 밤에는 밀집 주거지의 친구 집에 가고, 다음 날에는 운동장에 들렀다가 밤에 터미널로 돌아갈 거예요.'}
  ];
  var mall=[{image:'interlude-influencer.webp',fallback:'intro-village.webp',name:'진호 · 인플루언서',text:'안녕하세요, 진호예요! 오늘은 솔잎몰 개장 날이라 신도시에서 버스 타고 가는 길부터 라이브로 보여 드릴 거예요. 다들 몰로 몰릴 텐데… 방송 끝나면 저녁에는 신도시 집으로 돌아가야 해요.'}];
  var scenes={intro:intro,sol:sol,baseball:baseball,mall:mall};
  var STAGE_MS=1600,auto=null,IGNORE=['Tab','Shift','Control','Alt','Meta','CapsLock'];
  function $(id){return document.getElementById(id);}
  function clear(){if(timer!==null){clearInterval(timer);timer=null;}if(auto!==null){clearTimeout(auto);auto=null;}}
  function finish(){if(!active)return;var done=active.done;active=null;clear();$('goal-intro').close();document.body.classList.remove('story-open');done();}
  function reveal(){clear();if(!active)return;active.typed=active.text.length;$('story-typed').textContent=active.text;}
  // Stage card: shown before the story cuts, without a skip button. Any key, a click or the timer moves on.
  function drawStage(){
    clear();var a=active,d=$('goal-intro');
    d.dataset.stage='true';d.dataset.scene=a.kind;d.dataset.reduced=String(PB.App.reducedMotion());d.setAttribute('aria-labelledby','story-stage-title');
    $('story-stage-title').textContent='Stage '+a.stage.number;$('story-stage-sub').textContent=a.stage.name+' · '+a.stage.number+' / '+a.stage.total;
    auto=setTimeout(function(){if(active===a&&a.onStage)next();},STAGE_MS);
  }
  function draw(){
    clear();var a=active,cut=a.cuts[a.index],img=$('story-image');
    if(a.onStage){drawStage();return;}
    $('goal-intro').dataset.stage='false';$('goal-intro').setAttribute('aria-labelledby','goal-intro-h');
    $('goal-intro').dataset.scene=a.kind;$('goal-intro').dataset.cut=String(a.index);
    $('goal-intro').dataset.reduced=String(PB.App.reducedMotion());
    $('goal-intro-h').textContent=cut.name;$('story-count').textContent=(a.index+1)+' / '+a.cuts.length;
    $('story-full').textContent=cut.text;a.text=cut.text;a.typed=0;$('story-typed').textContent='';
    img.alt=cut.name==='솔잎마을의 AI'?'솔잎마을 전경':cut.name+'의 하루';img.dataset.fallback=cut.fallback||'';img.src='assets/art/'+cut.image;
    img.classList.remove('story-fade');void img.offsetWidth;img.classList.add('story-fade');
    $('story-next').textContent=a.index===a.cuts.length-1?(a.kind==='ending'?'운행 기록 살펴보기':a.kind==='intro'?'솔잎마을의 첫 노선 만들기':a.kind==='baseball'?'터미널과 운동장 연결하기':a.kind==='mall'?'솔잎몰 연결하기':'신도시 연결하기'):'다음';
    $('btn-goal-start').textContent=a.kind==='ending'?'결과로 건너뛰기':a.kind==='intro'?'건너뛰고 시작':'건너뛰기';
    if(PB.App.reducedMotion())reveal();
    else timer=setInterval(function(){if(active!==a)return; a.typed++;$('story-typed').textContent=a.text.slice(0,a.typed);if(a.typed>=a.text.length)clear();},28);
  }
  function next(){
    if(!active)return;
    if(active.onStage){active.onStage=false;if(!active.cuts.length){finish();return;}draw();$('story-next').focus();return;}
    if(active.typed<active.text.length){reveal();return;}if(active.index+1>=active.cuts.length){finish();return;}active.index++;draw();
  }
  // stage = {number,total,name}: optional card shown first. kind 'stage' plays the card alone.
  function play(kind,done,cuts,stage){
    if(active)return;
    cuts=cuts||scenes[kind]||[];
    if(!cuts.length&&!stage){done();return;}
    active={kind:kind,cuts:cuts,index:0,done:done,stage:stage||null,onStage:!!stage};
    document.body.classList.add('story-open');draw();$('goal-intro').showModal();if(active.onStage)$('goal-intro').focus();else $('story-next').focus();
    active.cuts.forEach(function(c){var img=new Image();img.src='assets/art/'+c.image;});
  }
  function init(){
    $('story-next').addEventListener('click',next);$('btn-goal-start').addEventListener('click',finish);
    $('story-image').addEventListener('click',next);$('goal-intro-text').addEventListener('click',next);$('story-stage').addEventListener('click',next);
    $('goal-intro').addEventListener('cancel',function(e){e.preventDefault();if(active&&active.onStage)next();else finish();});
    $('goal-intro').addEventListener('keydown',function(e){
      if(active&&active.onStage){if(IGNORE.indexOf(e.key)<0){e.preventDefault();if(!e.repeat)next();}return;}
      if(e.key==='ArrowRight'){e.preventDefault();if(!e.repeat)next();}
    });
    $('story-image').addEventListener('error',function(){if(this.dataset.fallback){var fallback=this.dataset.fallback;this.dataset.fallback='';this.alt='솔잎마을 전경 · 새 인물 일러스트 준비 중';this.src='assets/art/'+fallback;}else this.alt='일러스트를 불러오지 못했어요. 대사를 읽고 계속할 수 있습니다.';});
  }
  PB.Cutscene={play:play};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
