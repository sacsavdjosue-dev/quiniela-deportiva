// PDF_RESULTADOS_JORNADA_V1
// Reporte administrativo de resultados por jornada cerrada, sin teléfono ni datos de pago.
// Sin dependencias npm adicionales. Reutiliza exactamente el algoritmo de clasificación.
import {scoreRound} from './results-server.js';
import {roundClosedForOfficial} from './participant-simulator-server.js';

const A4_LANDSCAPE = {width:842, height:595};
const HEX = {
  navy:[0.050,0.135,0.209], blue:[0.090,0.239,0.310], green:[0.018,0.510,0.408],
  white:[1,1,1], ink:[0.086,0.161,0.207], muted:[0.366,0.432,0.472],
  pale:[0.943,0.965,0.971], line:[0.831,0.878,0.898], amber:[0.984,0.733,0.278]
};
const HEADER_X=[32,74,274,412,484,707];
const COL_WIDTH=[42,200,138,72,223,103];
const VALID_ID=/^[1-9]\d*$/;

function asPdfText(value) {
  // Fuentes PDF base de Windows-1252: cubre acentos, ñ y signos habituales en México.
  // Sustituir glifos no soportados evita PDF corruptos y símbolos invisibles.
  const extra=new Map([
    [0x20AC,0x80],[0x201A,0x82],[0x0192,0x83],[0x201E,0x84],[0x2026,0x85],
    [0x2020,0x86],[0x2021,0x87],[0x02C6,0x88],[0x2030,0x89],[0x0160,0x8A],
    [0x2039,0x8B],[0x0152,0x8C],[0x017D,0x8E],[0x2018,0x91],[0x2019,0x92],
    [0x201C,0x93],[0x201D,0x94],[0x2022,0x95],[0x2013,0x96],[0x2014,0x97],
    [0x02DC,0x98],[0x2122,0x99],[0x0161,0x9A],[0x203A,0x9B],[0x0153,0x9C],
    [0x017E,0x9E],[0x0178,0x9F]
  ]);
  return Array.from(String(value??''),char=>{
    const point=char.codePointAt(0);
    if((point>=32&&point<=126)||(point>=160&&point<=255))return char;
    if(extra.has(point))return String.fromCharCode(extra.get(point));
    if(char==='\n'||char==='\r'||char==='\t')return ' ';
    return '?';
  }).join('');
}
function literal(value){
  return '('+asPdfText(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')+')';
}
function rgb(c){return c.map(n=>n.toFixed(3)).join(' ')}
function wrapText(raw,limit=30){
  const words=String(raw??'').replace(/\s+/g,' ').trim().split(' ');
  const out=[];let current='';
  for(let word of words){
    if(!word)continue;
    while(word.length>limit){
      if(current){out.push(current);current=''}
      out.push(word.slice(0,limit));word=word.slice(limit);
    }
    if(!word)continue;
    if(!current)current=word;
    else if((current+' '+word).length<=limit)current+=' '+word;
    else{out.push(current);current=word}
  }
  if(current)out.push(current);
  return out.length?out:[''];
}
function formatWhen(d){
  try{return new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(d))+' (CDMX)'}
  catch{return String(d??'')}
}
const outcomeLabel=o=>({L:'Local',E:'Empate',V:'Visitante',S:'Suspendido'})[o]||'Pendiente';
function makeGraphicsPage(){
  const commands=[];
  return {
    commands,
    rect(x,y,w,h,fill){commands.push(`${rgb(fill)} rg ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`)},
    rule(x1,y1,x2,y2,color=HEX.line,width=0.7){commands.push(`${rgb(color)} RG ${width.toFixed(1)} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`)},
    text(x,y,value,{size=9,bold=false,color=HEX.ink}={}){
      commands.push(`${rgb(color)} rg BT /${bold?'F2':'F1'} ${size.toFixed(1)} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm ${literal(value)} Tj ET`);
    }
  };
}

function pdfObjects(pages){
  const objects=[null];
  const add=x=>{objects.push(x);return objects.length-1};
  const root=add('');const tree=add('');
  const regular=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageNumbers=[];
  pages.forEach(p=>{
    const data=Buffer.from(p.commands.join('\n')+'\n','latin1');
    const stream=add({stream:data,dict:`<< /Length ${data.length} >>`});
    pageNumbers.push(add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${A4_LANDSCAPE.width} ${A4_LANDSCAPE.height}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${stream} 0 R >>`));
  });
  objects[root]=`<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objects[tree]=`<< /Type /Pages /Kids [${pageNumbers.map(n=>n+' 0 R').join(' ')}] /Count ${pages.length} >>`;
  const parts=[Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n','latin1')];
  const offsets=[0];let size=parts[0].length;
  for(let i=1;i<objects.length;i++){
    offsets.push(size);
    const entry=objects[i];
    const head=Buffer.from(`${i} 0 obj\n`,'latin1');
    const payload=typeof entry==='string'?Buffer.from(entry+'\n','latin1'):
      Buffer.concat([Buffer.from(entry.dict+'\nstream\n','latin1'),entry.stream,Buffer.from('endstream\n','latin1')]);
    const end=Buffer.from('endobj\n','latin1');
    parts.push(head,payload,end);size+=head.length+payload.length+end.length;
  }
  const xrefStart=size;
  let xref=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++)xref+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  xref+=`trailer\n<< /Size ${objects.length} /Root ${root} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  parts.push(Buffer.from(xref,'latin1'));
  return Buffer.concat(parts);
}

export function buildRoundResultsPdf({round,outcomes,status='borrador',rankings,scoredMatches,expectedMatches,suspendedMatches=0,generatedAt=new Date()}){
  if(!round||!Array.isArray(outcomes)||!Array.isArray(rankings)||!Number.isFinite(scoredMatches))
    throw Error('Datos insuficientes para generar el PDF.');
  const games=Array.isArray(round.config?.teams)?round.config.teams.slice(0,outcomes.length):[];
  const definitive=status==='final'&&scoredMatches===expectedMatches&&suspendedMatches<=1;
  const statusText=definitive?'RESULTADOS FINALES':'RESULTADOS PROVISIONALES';
  const name=String(round.name??'Jornada').slice(0,120);
  const pages=[];let page=null;let y=0;
  const addPage=(continuation=false)=>{
    page=makeGraphicsPage();pages.push(page);
    page.rect(0,A4_LANDSCAPE.height-80,A4_LANDSCAPE.width,80,HEX.navy);
    page.rect(0,A4_LANDSCAPE.height-84,A4_LANDSCAPE.width,4,HEX.green);
    page.text(32,559,'QUINIELA DEPORTIVA',{size:19,bold:true,color:HEX.white});
    page.text(32,539,continuation?'Reporte por jornada - continuación':'Reporte de resultados por jornada',{size:11,color:HEX.white});
    page.text(578,554,statusText,{size:10,bold:true,color:definitive?HEX.amber:HEX.white});
    page.text(32,496,'Jornada: '+name,{size:12,bold:true});
    page.text(32,477,'Generado: '+formatWhen(generatedAt),{size:9,color:HEX.muted});
    y=455;
  };
  addPage();
  const statRows=[
    [`Participaciones: ${rankings.length}`,`Partidos puntuados: ${scoredMatches}/${expectedMatches}`],
    [`Suspendidos: ${suspendedMatches}`,`Estado: ${definitive?'Final':'Provisional / por validar'}`]
  ];
  statRows.forEach((entry,i)=>{
    const top=448-i*22;
    page.rect(32,top-18,778,19,i%2?HEX.white:HEX.pale);
    page.text(41,top-12,entry[0],{size:9,bold:i===0});
    page.text(420,top-12,entry[1],{size:9,bold:i===0});
  });
  page.text(32,385,'Resultados de los encuentros',{size:11,bold:true});
  const half=Math.ceil(outcomes.length/2);
  for(let i=0;i<outcomes.length;i++){
    const isRight=i>=half;
    const x=isRight?438:32;
    const j=isRight?i-half:i;
    const match=games[i]||{};
    const isWildcard=i===outcomes.length-1;
    const label=(isWildcard?'Comodín':`Juego ${i+1}`)+' - '+String(match.home||'Local')+' vs '+String(match.away||'Visitante');
    const shortLabel=label.length>57?label.slice(0,54)+'...':label;
    page.text(x,366-j*16,shortLabel,{size:7.8});
    page.text(x+317,366-j*16,`${outcomes[i]??'-'} (${outcomeLabel(outcomes[i])})`,{size:7.5,bold:true,color:HEX.blue});
  }
  page.text(32,254,'Clasificación completa de participantes',{size:11,bold:true});
  y=238;
  const header=()=>{
    page.rect(32,y-24,778,24,HEX.blue);
    const headings=['POS.','PARTICIPANTE','FOLIO','ACIERTOS','MEJOR COMBINACIÓN','COINCID.'];
    headings.forEach((label,i)=>page.text(HEADER_X[i]+5,y-15,label,{size:i===4?8:7.8,bold:true,color:HEX.white}));
    y-=24;
  };
  header();
  if(!rankings.length){page.text(36,y-18,'No hay quinielas registradas en esta jornada.',{size:11});y-=35}
  for(let i=0;i<rankings.length;i++){
    const row=rankings[i];
    const nameLines=wrapText(row.participant??'Participante sin nombre',36);
    const folioLines=wrapText(row.folio??'',24);
    const best=Array.isArray(row.bestCombinations)?row.bestCombinations[0]||'':row.bestCombination||'';
    const comboLines=wrapText(best.split('').join(' '),32);
    const maxLines=Math.max(nameLines.length,folioLines.length,comboLines.length,1);
    const height=Math.max(28,maxLines*11+11);
    if(y-height<50){
      addPage(true);y=453;
      header();
    }
    if(i%2===0)page.rect(32,y-height,778,height,HEX.pale);
    page.rule(32,y-height,810,y-height,HEX.line,0.4);
    const position=scoredMatches>0?String(row.rank??i+1):'-';
    page.text(HEADER_X[0]+7,y-17,position,{size:9,bold:true});
    nameLines.forEach((line,j)=>page.text(HEADER_X[1]+5,y-16-j*11,line,{size:9,bold:j===0}));
    folioLines.forEach((line,j)=>page.text(HEADER_X[2]+5,y-16-j*11,line,{size:8.5}));
    page.text(HEADER_X[3]+5,y-17,scoredMatches?`${row.bestScore??0}/${scoredMatches}`:'Pendiente',{size:9,bold:true,color:HEX.green});
    comboLines.forEach((line,j)=>page.text(HEADER_X[4]+5,y-16-j*11,line,{size:8.7}));
    page.text(HEADER_X[5]+5,y-17,scoredMatches?String(row.bestCombinationsCount??0):'-',{size:9});
    y-=height;
  }
  for(let n=0;n<pages.length;n++){
    const p=pages[n];
    p.rule(32,38,810,38,HEX.line);
    p.text(32,24,'Uso administrativo. Sin teléfonos ni datos financieros. Los premios requieren revisión de pagos.',{size:7.3,color:HEX.muted});
    p.text(755,24,`Pág. ${n+1}/${pages.length}`,{size:8,bold:true,color:HEX.muted});
  }
  return pdfObjects(pages);
}

const validId=value=>VALID_ID.test(String(value??''))&&Number.isSafeInteger(Number(value))?Number(value):null;
export function installRoundResultsPdf(app,pool,requireAdmin){
  app.get('/api/admin/rounds/:id/results.pdf',requireAdmin,async(req,res,next)=>{
    const id=validId(req.params.id);
    if(!id)return res.status(400).json({error:'Jornada inválida.'});
    try{
      const result=await pool.query(`SELECT r.id,r.name,r.config,r.is_active,r.created_at,
         x.outcomes,x.status,x.published,x.updated_at
        FROM rounds r LEFT JOIN round_results x ON x.round_id=r.id WHERE r.id=$1`,[id]);
      if(!result.rowCount)return res.status(404).json({error:'Jornada no encontrada.'});
      const row=result.rows[0];
      if(!roundClosedForOfficial(row))return res.status(409).json({error:'Solo puedes descargar el reporte cuando la jornada esté cerrada.'});
      const count=Number(row.config?.matchCount??row.config?.teams?.length);
      if(![10,11].includes(count)||!Array.isArray(row.outcomes)||row.outcomes.length!==count){
        return res.status(409).json({error:'Esta jornada no tiene marcadores guardados. Captura resultados antes de descargar el PDF.'});
      }
      const bets=await pool.query(`SELECT folio,name,combinations,created_at FROM bets
         WHERE round_id=$1 ORDER BY id`,[id]);
      const ranking=scoreRound(row.outcomes,bets.rows);
      const pdf=buildRoundResultsPdf({round:row,outcomes:row.outcomes,status:row.status,
        rankings:ranking.rankings,scoredMatches:ranking.scoredMatches,
        expectedMatches:ranking.expectedMatches,suspendedMatches:ranking.suspendedMatches});
      const slug=String(row.name||'jornada').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50)||'jornada';
      res.set('Content-Type','application/pdf');
      res.set('Content-Disposition',`attachment; filename="resultados-jornada-${id}-${slug}.pdf"`);
      res.set('Cache-Control','no-store, private');
      res.set('X-Content-Type-Options','nosniff');
      res.set('Content-Length',String(pdf.length));
      return res.send(pdf);
    }catch(error){next(error)}
  });
}
