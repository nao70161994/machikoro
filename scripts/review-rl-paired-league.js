'use strict';

/**
 * Paired-seat inference over saved head-to-head reports.
 * Unlike independent-game Wilson intervals, this respects the RNG/seat blocks
 * emitted by eval-rl-head-to-head.js, and never treats a non-significant
 * single matchup or an aggregated league rank as a confirmed promotion.
 */
const fs = require('fs');
const path = require('path');

function modelName(value) {
    return path.basename(String(value || '')).replace(/\.browser\.json$/, '');
}
function decision(entries) {
    const observed = entries.reduce((sum, e) => sum + e.candidateWins, 0);
    const compared = entries.reduce((sum, e) => sum + e.baselineWins, 0);
    const intervals = entries.map(e => e.pairedBlockBootstrap?.confidenceInterval);
    if (intervals.some(v => !v || !Number.isFinite(v.lower) || !Number.isFinite(v.upper))) {
        return 'insufficient-block-data';
    }
    if (entries.every(e => e.pairedBlockBootstrap.valid && e.pairedBlockBootstrap.confidenceInterval.lower > 0.5)) return 'candidate-favored';
    if (entries.every(e => e.pairedBlockBootstrap.valid && e.pairedBlockBootstrap.confidenceInterval.upper < 0.5)) return 'baseline-favored';
    if (observed + compared === 0) return 'no-decisive-games';
    return 'inconclusive';
}
function row(report) {
    if (!report || !Array.isArray(report.entries) || !report.entries.length ||
      report.pairedSeats !== true) throw Error('missing valid paired-seat match report');
    const n = report.entries[0].lineup.length;
    if (![2,4].includes(n) || report.gamesPerLineup % n !== 0 ||
      report.entries.some(e => e.lineup.length !== n || e.exhausted > 0)) {
        throw Error('unbalanced or incomplete paired-seat evaluation');
    }
    const a=modelName(report.candidate), b=modelName(report.baseline);
    if (a===b) throw Error('self comparison');
    const detail=report.entries.map(e=>{
        const ci=e.pairedBlockBootstrap?.confidenceInterval||null;
        const aSeats=e.candidateSeats?.games||[];
        const bSeats=e.baselineSeats?.games||[];
        const expected=e.games/n;
        const balancedSeats=aSeats.length===n && bSeats.length===n &&
          aSeats.every(v=>v===expected) && bSeats.every(v=>v===expected);
        if (!balancedSeats) throw Error('unequal observed seat representation');
        return {
            lineup:e.lineup,
            candidateWins:e.candidateWins,
            baselineWins:e.baselineWins,
            cpuWins:e.games-e.candidateWins-e.baselineWins,
            candidateSeatGap:e.candidateSeats?.gap,
            baselineSeatGap:e.baselineSeats?.gap,
            pairedBlocks:e.pairedBlockBootstrap?.blockCount||0,
            confidence95:ci,
            pairedVerdict:e.pairedBlockBootstrap?.valid && ci?
              ci.lower>0.5?'candidate-favored':ci.upper<0.5?'baseline-favored':'inconclusive':'insufficient-block-data',
        };
    });
    const totalA=detail.reduce((s,d)=>s+d.candidateWins,0);
    const totalB=detail.reduce((s,d)=>s+d.baselineWins,0);
    return {
        players:n, candidate:a, baseline:b, games:report.totals.games,
        candidateWins:totalA, baselineWins:totalB,
        cpuWins:detail.reduce((s,d)=>s+d.cpuWins,0),
        candidateShare:totalA+totalB>0?totalA/(totalA+totalB):null,
        verdict:decision(report.entries),
        maxCandidateSeatGap:Math.max(...detail.map(d=>d.candidateSeatGap||0)),
        maxBaselineSeatGap:Math.max(...detail.map(d=>d.baselineSeatGap||0)),
        lineups:detail,
    };
}
function assess(reports) {
    const rows=reports.map(row).sort((a,b)=>a.players-b.players || a.candidate.localeCompare(b.candidate) || a.baseline.localeCompare(b.baseline));
    const seen=new Set();
    for(const r of rows){
        const key=r.players+'p:'+ [r.candidate,r.baseline].sort().join(':');
        if(seen.has(key))throw Error('duplicate paired comparison '+key);
        seen.add(key);
    }
    return {
        schemaVersion:1,
        warnings:[
            'Paired-seat 95% bootstrap intervals are exploratory and uncorrected for multiple comparisons across the league.',
            'An overall league win share does not establish a ranking significance or imply transitive strength.',
            'Multiplayer decision is conservative: every observed lineup must support the same side before calling a winner.',
        ],rows
    };
}
function markdown(result) {
    const lines=['# AI league: paired-seat inference', '',
        ...result.warnings.map(s=>'- '+s),'',
        '| Players | Candidate | Baseline | Wins | Losses | CPU wins | AI share | Paired decision | Max candidate seat gap |',
        '|---:|---|---|---:|---:|---:|---:|---|---:|'];
    for (const r of result.rows) lines.push(
        '| '+r.players+' | '+r.candidate+' | '+r.baseline+' | '+r.candidateWins+' | '+r.baselineWins+' | '+r.cpuWins+' | '+
        (r.candidateShare===null?'n/a':(100*r.candidateShare).toFixed(1)+'%')+' | '+r.verdict+' | '+
        (100*r.maxCandidateSeatGap).toFixed(1)+'pt |'
    );
    lines.push('','## Per-lineup paired bootstrap intervals','',
        '| Matchup | Lineup | Blocks | Paired 95% interval | Verdict |',
        '|---|---|---:|---:|---|');
    for(const r of result.rows)for(const d of r.lineups){
        const ci=d.confidence95, fmt=n=>(n*100).toFixed(1)+'%';
        lines.push('| '+r.candidate+' vs '+r.baseline+' | '+d.lineup.join(',')+' | '+d.pairedBlocks+
          ' | '+(ci?fmt(ci.lower)+'–'+fmt(ci.upper):'n/a')+' | '+d.pairedVerdict+' |');
    }
    return lines.join('\n')+'\n';
}
function main(argv=process.argv.slice(2)){
    const dir=argv[0]||'artifacts/rl-league/raw',out=argv[1]||'artifacts/rl-league/paired-review';
    const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort();
    if(!files.length)throw Error('No league matchup JSON files found');
    const report=assess(files.map(f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))));
    fs.mkdirSync(path.dirname(out),{recursive:true});
    fs.writeFileSync(out+'.json',JSON.stringify(report,null,2)+'\n');
    fs.writeFileSync(out+'.md',markdown(report));
    console.log(markdown(report));
}
if(require.main===module)main();
module.exports={modelName,decision,row,assess,markdown};
