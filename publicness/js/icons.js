/* Local SVG assets. All controls share 24x24, 2px rounded currentColor strokes. */
(function(root){
  'use strict';
  var paths={
    play:'M8 4 20 12 8 20Z', pause:'M8 4v16M16 4v16',
    undo:'M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12',
    next:'M5 5 15 12 5 19ZM19 5v14',
    forward:'M3 5 12 12 3 19ZM13 5 22 12 13 19Z',
    sound:'M3 9h4l5-4v14l-5-4H3ZM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14',
    mute:'M3 9h4l5-4v14l-5-4H3ZM16 9l6 6M22 9l-6 6',
    settings:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
    help:'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    plus:'M12 5v14M5 12h14', minus:'M5 12h14', close:'M6 6l12 12M18 6 6 18',
    bus:'M5 18V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v13ZM5 11h14M8 15h.01M16 15h.01M7 18v3M17 18v3',
    move:'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4',
    reset:'M4 4v6h6M4 10a8 8 0 1 1 1 8'
  };
  function icon(name){
    var ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg'),p=document.createElementNS(ns,'path');
    var attrs={viewBox:'0 0 24 24',width:22,height:22,fill:'none',stroke:'currentColor','stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false','class':'ui-icon','data-icon':name};
    Object.keys(attrs).forEach(function(k){s.setAttribute(k,attrs[k]);});
    p.setAttribute('d',paths[name]||paths.help);s.appendChild(p);return s;
  }
  function label(b,name,text){b.textContent='';b.appendChild(icon(name));var t=document.createElement('span');t.className='btn-text';t.textContent=text;b.appendChild(t);b.setAttribute('aria-label',text);return b;}
  root.PB=root.PB||{};root.PB.Icons={create:icon,label:label};
})(window);
