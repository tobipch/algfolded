/**
 * Generate ambiguous scrambles for all 3-twist cases (src/assets/three_twists.json).
 * Same approach as generate_scrambles.mjs: derive the state from inverse(alg),
 * solve with Kociemba, obfuscate. State comes from the alg, so no twist geometry
 * is hand-coded.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { puzzles } from "cubing/puzzles";
import { Alg } from "cubing/alg";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";

const SCRAMBLES_PER_CASE = 20;
const MIN_LENGTH = 14;
const MAX_PREMOVES = 10;
const INITIAL_PREMOVES = 3;
const PATH = new URL("../src/assets/three_twists.json", import.meta.url);

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

// scramble is valid if scramble + alg returns to solved (ignoring centers, which
// don't matter for a 3x3). Guards against the rare rotated-solution / cancel bug.
function solvedIgnoringCenters(solved, p){
  for(const orbit in solved.patternData){
    if(orbit==="CENTERS") continue;
    const a=p.patternData[orbit], b=solved.patternData[orbit];
    for(let i=0;i<b.pieces.length;i++) if(a.pieces[i]!==b.pieces[i]) return false;
    for(let i=0;i<b.orientation.length;i++) if(a.orientation[i]!==b.orientation[i]) return false;
  }
  return true;
}

async function main(){
  const map=JSON.parse(readFileSync(PATH,"utf-8"));
  const kpuzzle=await puzzles["3x3x3"].kpuzzle();
  const solved=kpuzzle.defaultPattern();
  const keys=Object.keys(map), total=keys.length; let done=0, retries=0;
  await experimentalSolve3x3x3IgnoringCenters(kpuzzle.defaultPattern().applyAlg(new Alg("R U R'")));
  const t0=Date.now();
  for(const key of keys){
    const c=map[key];
    if(!c.algs||!c.algs.length){done++;continue}
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
    if(done%10===0||done===total){const el=((Date.now()-t0)/1000).toFixed(0);const eta=(((Date.now()-t0)/done)*(total-done)/1000).toFixed(0);console.log(`[${done}/${total}] ${el}s elapsed ~${eta}s left (retries=${retries})`)}
  }
  writeFileSync(PATH, JSON.stringify(map,null,2)+"\n");
  console.log(`Done in ${((Date.now()-t0)/1000).toFixed(0)}s -> ${PATH.pathname}`);
}
main().catch(e=>{console.error(e);process.exit(1)});
