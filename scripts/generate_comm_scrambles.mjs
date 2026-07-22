/**
 * Generate ambiguous scrambles for the edge- and corner-commutator sets
 * (src/assets/{corner,edge}_comms.json). Same approach as
 * generate_twist_scrambles.mjs: derive the state from inverse(alg), solve with
 * Kociemba, obfuscate. State comes from the alg, so no geometry is hand-coded.
 *
 * Idempotent: cases that already carry `scrambles` are skipped, so the script
 * can be resumed. Set env COMM_SET=corner|edge to restrict to one file, and
 * COMM_LIMIT=N to cap how many (previously empty) cases are processed per run.
 *
 * Usage: node scripts/generate_comm_scrambles.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { puzzles } from "cubing/puzzles";
import { Alg } from "cubing/alg";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";

const SCRAMBLES_PER_CASE = 20;
const MIN_LENGTH = 14;
const MAX_PREMOVES = 10;
const INITIAL_PREMOVES = 3;
const SAVE_EVERY = 20; // persist progress periodically so long runs are resumable

const FILES = {
  corner: new URL("../src/assets/corner_comms.json", import.meta.url),
  edge: new URL("../src/assets/edge_comms.json", import.meta.url),
};

const MOVES = ["U", "R", "F", "D", "L", "B"];
const SUFFIXES = ["", "'", "2"];
const OPPOSITE = { U: "D", D: "U", R: "L", L: "R", F: "B", B: "F" };

function generatePremoves(n){let p="",r=[];for(let i=0;i<n;i++){let m;do{m=MOVES[Math.floor(Math.random()*MOVES.length)]}while(m===p||m===OPPOSITE[p]);p=m;r.push(m+SUFFIXES[Math.floor(Math.random()*3)])}return r.join(" ")}
function invertMoves(s){return new Alg(s).invert().toString().replace(/(\w)2'/g,"$12")}
function normalizeNotation(s){return s.replace(/(\w)2'/g,"$12").replace(/(\w)3'/g,"$1").replace(/(\w)3/g,"$1'")}
function moveCount(s){return s.trim().split(/\s+/).length}
function parseMoveList(s){if(!s.trim())return[];return s.trim().split(/\s+/).map(m=>({face:m[0],suffix:m.slice(1)}))}
function combineSuffix(a,b){const v={"":1,"'":-1,"2":2};const s=((v[a]+v[b])%4+4)%4;return s===0?null:s===1?"":s===2?"2":"'"}
function cancelParallelMoves(str){let moves=parseMoveList(str),ch=true;while(ch){ch=false;for(let i=0;i<moves.length;i++){const f=moves[i].face,o=OPPOSITE[f];let j=i+1;while(j<moves.length&&moves[j].face===o)j++;if(j<moves.length&&moves[j].face===f){const c=combineSuffix(moves[i].suffix,moves[j].suffix);if(c===null){moves.splice(j,1);moves.splice(i,1)}else{moves[i]={face:f,suffix:c};moves.splice(j,1)}ch=true;break}}}return moves.map(m=>m.face+m.suffix).join(" ")}

async function generateOneScramble(kpuzzle, inverseAlgStr, solve){
  for(let n=INITIAL_PREMOVES;n<=MAX_PREMOVES;n++){
    const pre=generatePremoves(n), ipre=invertMoves(pre);
    const pattern=kpuzzle.defaultPattern().applyAlg(new Alg(ipre+" "+inverseAlgStr));
    const sol=await solve(pattern);
    const raw=new Alg(pre).concat(sol.invert()).experimentalSimplify({cancel:true});
    const scr=cancelParallelMoves(normalizeNotation(raw.toString()));
    if(moveCount(scr)>=MIN_LENGTH)return scr;
  }
  const pre=generatePremoves(MAX_PREMOVES),ipre=invertMoves(pre);
  const pattern=kpuzzle.defaultPattern().applyAlg(new Alg(ipre+" "+inverseAlgStr));
  const sol=await solve(pattern);
  const raw=new Alg(pre).concat(sol.invert()).experimentalSimplify({cancel:true});
  return cancelParallelMoves(normalizeNotation(raw.toString()));
}

// scramble is valid if scramble + alg returns to solved (ignoring centers).
function solvedIgnoringCenters(solved, p){
  for(const orbit in solved.patternData){
    if(orbit==="CENTERS") continue;
    const a=p.patternData[orbit], b=solved.patternData[orbit];
    for(let i=0;i<b.pieces.length;i++) if(a.pieces[i]!==b.pieces[i]) return false;
    for(let i=0;i<b.orientation.length;i++) if(a.orientation[i]!==b.orientation[i]) return false;
  }
  return true;
}

async function processFile(name, path, kpuzzle, solved, limit){
  const map=JSON.parse(readFileSync(path,"utf-8"));
  const keys=Object.keys(map);
  const todo=keys.filter(k=>Array.isArray(map[k].algs)&&map[k].algs.length&&(!map[k].scrambles||!map[k].scrambles.length));
  const capped=limit?todo.slice(0,limit):todo;
  console.log(`[${name}] ${keys.length} cases, ${todo.length} need scrambles${limit?` (processing ${capped.length})`:""}.`);
  let done=0, retries=0; const t0=Date.now();
  for(const key of capped){
    const c=map[key];
    const algAlg=new Alg(c.algs[0]);
    const inv=algAlg.invert().toString();
    const scr=[];
    for(let i=0;i<SCRAMBLES_PER_CASE;i++){
      let s, valid=false;
      for(let attempt=0; attempt<40 && !valid; attempt++){
        s=await generateOneScramble(kpuzzle,inv,experimentalSolve3x3x3IgnoringCenters);
        valid=solvedIgnoringCenters(solved, solved.applyAlg(new Alg(s)).applyAlg(algAlg));
        if(!valid) retries++;
      }
      scr.push(s);
    }
    c.scrambles=scr; done++;
    if(done%SAVE_EVERY===0||done===capped.length){
      writeFileSync(path, JSON.stringify(map,null,2)+"\n");
      const el=((Date.now()-t0)/1000).toFixed(0);
      const eta=(((Date.now()-t0)/done)*(capped.length-done)/1000).toFixed(0);
      console.log(`[${name}] ${done}/${capped.length} ${el}s elapsed ~${eta}s left (retries=${retries})`);
    }
  }
  writeFileSync(path, JSON.stringify(map,null,2)+"\n");
  console.log(`[${name}] done -> ${path.pathname}`);
}

async function main(){
  const kpuzzle=await puzzles["3x3x3"].kpuzzle();
  const solved=kpuzzle.defaultPattern();
  await experimentalSolve3x3x3IgnoringCenters(kpuzzle.defaultPattern().applyAlg(new Alg("R U R'")));
  const only=process.env.COMM_SET;
  const limit=process.env.COMM_LIMIT?parseInt(process.env.COMM_LIMIT,10):0;
  for(const [name,path] of Object.entries(FILES)){
    if(only && only!==name) continue;
    await processFile(name, path, kpuzzle, solved, limit);
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
