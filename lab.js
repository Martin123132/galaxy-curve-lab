'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const ns = 'http://www.w3.org/2000/svg';
  const dims = ['radius','value','error','curve','object'];
  const required = new Set(['radius','value']);
  const aliases = {radius:['radius','r'],value:['measuredvalue','observed','velocity','speed','value'],
    error:['uncertainty','error','sigma'],curve:['prediction','predicted','curve'],object:['object','galaxy','id']};
  let headers=[], rows=[], groups=new Map(), points=[], invalid=0, page=0, serial=0;
  const pageSize=50, numFmt=new Intl.NumberFormat(undefined,{maximumSignificantDigits:5});
  const opt=(label,val)=>new Option(label,String(val));
  const number=s=>s.trim()!=='' && Number.isFinite(Number(s)) ? Number(s) : null;
  function parse(text) {
    const data=[]; let row=[], field='', quoted=false, closed=false;
    const endField=()=>{row.push(field);field='';closed=false;if(row.length>128)throw Error('More than 128 columns.');};
    function endRow(){endField();if(row.some(s=>s.trim()!==''))data.push(row);row=[];
      if(data.length>10001)throw Error('The file exceeds 10,000 data rows.');}
    text=text.replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){
        if(c!=='"')field+=c;
        else if(text[i+1]==='"'){field+='"';i++;}
        else{quoted=false;closed=true;}
      }else if(c===',')endField();
      else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();}
      else if(closed)throw Error('Unexpected text after a quoted field.');
      else if(c==='"'){if(field)throw Error('Unexpected quote in a field.');quoted=true;}
      else field+=c;
    }
    if(quoted)throw Error('Unclosed quoted field.');
    endRow();
    if(data.length<2)throw Error('A header and at least one data row are required.');
    const names=data.shift().map(s=>s.trim());
    if(names.length<2||names.some(s=>!s)||new Set(names).size!==names.length)
      throw Error('Use at least two distinct, nonempty column headers.');
    if(data.some(r=>r.length!==names.length))throw Error('A data row has a different number of columns from the header.');
    return [names,data];
  }
  function mapping(){
    const key=headers.map(s=>s.toLowerCase().replace(/[^a-z0-9]/g,''));
    for(const d of dims){
      const el=$(d);el.replaceChildren(opt(required.has(d)?'Select a column':'None',-1),...headers.map((s,i)=>opt(s,i)));
      const i=key.findIndex(s=>aliases[d].includes(s));
      el.value=String(i);
    }
    if(headers.length && $('radius').value==='-1')$('radius').value='0';
    if(headers.length && $('value').value==='-1')$('value').value=$('radius').value==='0'?'1':'0';
    $('fields').disabled=!headers.length;
  }
  function series(){
    const group=+$('object').value, last=$('series').value;
    groups=new Map();
    for(const row of rows){
      const id=group<0?'':row[group];
      if(!groups.has(id))groups.set(id,[]);
      groups.get(id).push(row);
    }
    $('series').replaceChildren(...Array.from(groups.keys(),s=>opt(group<0?'All rows':s||'(blank)',s)));
    if(!groups.size)$('series').add(opt('All rows',''));
    if(groups.has(last))$('series').value=last;
    $('series').disabled=group<0||!groups.size;
    refresh();
  }
  function refresh(){
    const [x,y,e,c]=dims.map(k=>+$(k).value);
    points=[];invalid=0;page=0;
    const ok=x>=0&&y>=0&&x!==y;
    if(ok) for(const row of groups.get($('series').value)||[]){
      const xv=number(row[x]),yv=number(row[y]);if(xv===null||yv===null){invalid++;continue;}
      const ev=e<0?null:number(row[e]);
      points.push({x:xv,y:yv,e:ev!==null&&ev>=0?ev:null,c:c<0?null:number(row[c])});
    }
    points.sort((a,b)=>a.x-b.x);
    $('notice').textContent=rows.length&&!ok?'Select distinct radius and measured-value columns.':'';
    $('count').textContent=points.length+' point'+(points.length===1?'':'s')+(invalid?' | '+invalid+' invalid row'+(invalid===1?'':'s')+' omitted':'');
    $('curveKey').hidden=!points.some(p=>p.c!==null);
    $('export').disabled=!points.length;$('clear').disabled=!rows.length;
    $('empty').replaceChildren();
    if(!rows.length){
      const btn=document.createElement('button');btn.textContent='Open CSV';btn.onclick=()=>$('file').click();
      $('empty').append(btn);
    }else if(!points.length)$('empty').textContent='No plottable measurements';
    $('empty').hidden=!!points.length;
    renderTable();draw();
  }
  function renderTable(){
    const cols=[['radius','x'],['value','y'],['error','e'],['curve','c']].filter(([k])=>+$(k).value>=0);
    const tr=document.createElement('tr');
    for(const [k] of cols){const th=document.createElement('th');th.textContent=headers[+$(k).value];tr.append(th);}
    $('head').replaceChildren(tr);$('body').replaceChildren();
    for(const item of points.slice(page*pageSize,(page+1)*pageSize)){
      const row=document.createElement('tr');for(const [,k] of cols){const td=document.createElement('td');
        td.textContent=item[k]===null?'':String(item[k]);row.append(td);} $('body').append(row);
    }
    const total=Math.ceil(points.length/pageSize);$('page').textContent=(total?page+1:0)+' / '+total;
    $('prev').disabled=page===0;$('next').disabled=page+1>=total;
  }
  function svg(name,attrs,parent,content){
    const node=document.createElementNS(ns,name);
    for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));
    if(content!==undefined)node.textContent=content;parent.append(node);return node;
  }
  function draw(){
    const chart=$('chart');
    if($('graphic').hidden)return;
    const W=Math.max(200,Math.round(chart.clientWidth)), H=Math.max(180,Math.round(chart.clientHeight));
    chart.replaceChildren();chart.setAttribute('viewBox','0 0 '+W+' '+H);
    const left=W<520?64:82,right=W-24,top=26,bottom=H-55;
    const line=(x1,y1,x2,y2,stroke,width=1)=>svg('line',{x1,y1,x2,y2,stroke,'stroke-width':width},chart);
    const label=(x,y,value,attrs={})=>svg('text',{x,y,fill:'#47534d','font-size':12,'font-family':'system-ui,sans-serif',...attrs},chart,value);
    svg('rect',{x:0,y:0,width:W,height:H,fill:'white'},chart);
    const data=points.length>0;
    let xmin=0,xmax=1,ymin=0,ymax=1;
    if(data){
      xmin=points[0].x;xmax=points[points.length-1].x;ymin=Infinity;ymax=-Infinity;
      for(const p of points){ymin=Math.min(ymin,p.y-(p.e||0),p.c??p.y);ymax=Math.max(ymax,p.y+(p.e||0),p.c??p.y);}
      if(xmin===xmax){const d=Math.abs(xmin)*.05||1;xmin-=d;xmax+=d;}
      const pad=(ymax-ymin)*.05||Math.abs(ymin)*.05||1;ymin-=pad;ymax+=pad;
    }
    const X=x=>left+(x-xmin)/(xmax-xmin)*(right-left),Y=y=>bottom-(y-ymin)/(ymax-ymin)*(bottom-top);
    for(let i=0;i<=4;i++){const f=i/4,xx=left+(right-left)*f,yy=bottom-(bottom-top)*f;
      line(left,yy,right,yy,'#dfe5e0');line(xx,top,xx,bottom,'#edf0ed');
      if(data){label(xx,bottom+18,numFmt.format(xmin+(xmax-xmin)*f),{'text-anchor':'middle'});
        label(left-8,yy+4,numFmt.format(ymin+(ymax-ymin)*f),{'text-anchor':'end'});}
    }
    line(left,top,left,bottom,'#88978d');line(left,bottom,right,bottom,'#88978d');
    if(!data)return;
    const axis=(d)=>{const s=headers[+$(d).value];return s.length>38?s.slice(0,37)+'\u2026':s;};
    label((left+right)/2,H-9,axis('radius'),{'text-anchor':'middle'});
    const mid=(top+bottom)/2;label(14,mid,axis('value'),{'text-anchor':'middle',transform:'rotate(-90 14 '+mid+')'});
    let path='',start=true;
    for(const p of points){if(p.c===null){start=true;continue;}path+=(start?'M':'L')+X(p.x)+' '+Y(p.c)+' ';start=false;}
    if(path)svg('path',{d:path,fill:'none',stroke:'#b04223','stroke-width':2},chart);
    for(const p of points){
      const xx=X(p.x);if(p.e!==null)line(xx,Y(p.y-p.e),xx,Y(p.y+p.e),'#91afa2');
      svg('circle',{cx:xx,cy:Y(p.y),r:2.8,fill:'#276650'},chart);
      if(p.c!==null)svg('circle',{cx:xx,cy:Y(p.c),r:1.7,fill:'#b04223'},chart);
    }
  }
  function view(table){
    $('graphic').hidden=table;$('data').hidden=!table;
    $('plot').setAttribute('aria-pressed',String(!table));$('table').setAttribute('aria-pressed',String(table));
    if(!table)draw();
  }
  $('open').onclick=()=>$('file').click();
  $('file').onchange=async()=>{
    const f=$('file').files[0];if(!f)return;
    const token=++serial;$('file').value='';
    try{
      if(f.size>4*1024*1024)throw Error('The file exceeds 4 MiB.');
      const [hh,rr]=parse(await f.text());if(token!==serial)return;
      headers=hh;rows=rr;$('source').textContent=f.name;mapping();series();
    }catch(err){if(token===serial)$('notice').textContent='Could not open CSV: '+err.message;}
  };
  $('clear').onclick=()=>{serial++;headers=[];rows=[];$('file').value='';$('source').textContent='No file selected';mapping();series();view(false);};
  for(const k of dims)$(k).onchange=k==='object'?series:refresh;
  $('series').onchange=refresh;$('plot').onclick=()=>view(false);$('table').onclick=()=>view(true);
  $('prev').onclick=()=>{if(page>0){page--;renderTable();}};$('next').onclick=()=>{if((page+1)*pageSize<points.length){page++;renderTable();}};
  $('export').onclick=()=>{
    if(!points.length)return;const was=$('graphic').hidden;
    if(was)view(false);const chart=$('chart').cloneNode(true);if(was)view(true);
    const vb=chart.getAttribute('viewBox').split(' ');chart.setAttribute('width',vb[2]);chart.setAttribute('height',vb[3]);
    const href=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(chart)],{type:'image/svg+xml'}));
    const a=document.createElement('a');a.href=href;a.download='radial-curve.svg';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
  };
  new ResizeObserver(()=>draw()).observe($('graphic'));
  mapping();series();
})();
