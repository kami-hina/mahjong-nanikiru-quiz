// AI 4人で半荘を自動対局して、例外・点数の保存則・終了条件を確かめる
const MJ=require('../../local/mj-core.js'); global.MJ=MJ;
require('../../local/ai-weights.js');
const AI=require('../../local/mj-ai.js');
const {Game}=require('../../local/mj-game.js');
const N=+(process.argv[2]||5);
const stats={games:0,kyoku:0,hora:0,tsumo:0,ron:0,draw:0,abort:{},riichi:0,calls:0,yaku:{},dealin:[0,0,0,0],ms:0,decisions:0,west:0,maxMs:0};
for(let g=0;g<N;g++){
  const game=new Game({seed:1000+g});
  game.startKyoku();
  let guard=0;
  while(!game.over&&guard++<5000){
    const req=game.request();
    if(req.kind==='self'||req.kind==='riichi_discard'){
      const t=Date.now();
      const obs=game.obsFor(req.seat);
      const d=AI.decide(obs,req.actions);
      const dt=Date.now()-t; stats.ms+=dt; stats.decisions++; if(dt>stats.maxMs) stats.maxMs=dt;
      game.actSelf(d.best);
    } else if(req.kind==='react'){
      for(const x of req.seats){ const obs=game.obsFor(x.seat); obs.last={actor:req.from,pai:req.tile};
        const d=AI.decide(obs,x.actions); game.actReact(x.seat,d.best); }
    } else if(req.kind==='end_kyoku'){
      stats.kyoku++;
      const r=req.result;
      if(r.type==='hora'){ stats.hora++; for(const w of r.wins){ if(w.actor===w.target) stats.tsumo++; else { stats.ron++; stats.dealin[w.target]++; }
        for(const y of w.yaku) stats.yaku[y[0]]=(stats.yaku[y[0]]||0)+1; } }
      else if(r.abort) stats.abort[r.reason]=(stats.abort[r.reason]||0)+1; else stats.draw++;
      const sum=game.scores.reduce((a,b)=>a+b,0)+game.kyotaku*1000;
      if(sum!==100000) throw new Error('score sum '+sum+' '+JSON.stringify(game.scores));
      if(game.bakaze>=2) stats.west++;
      game.next();
    }
  }
  if(!game.over) throw new Error('game did not finish');
  stats.games++;
  for(const e of game.log){ if(e.type==='reach_accepted') stats.riichi++; if(['chi','pon','daiminkan'].includes(e.type)) stats.calls++; }
  console.log('game',g,'final',JSON.stringify(game.result.scores),'kyoku',game.kyokuNo,'final pts',JSON.stringify(game.result.final));
}
stats.avgMs=(stats.ms/stats.decisions).toFixed(1);
console.log(JSON.stringify(stats,null,1));
