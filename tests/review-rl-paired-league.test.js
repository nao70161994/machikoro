'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const { row, assess, markdown } = require('../scripts/review-rl-paired-league');

function make(a, b, wins, losses, interval, players=2) {
    const games=players===2?120:80;
    const seats=Array(players).fill(games/players);
    return {
        candidate:'models/rl_model/portfolio/'+a+'.browser.json',
        baseline:'models/rl_model/portfolio/'+b+'.browser.json',
        pairedSeats:true,gamesPerLineup:games,
        entries:[{
            lineup: players===2?['candidate','baseline']:['candidate','baseline','normal','strong'],
            games, candidateWins:wins, baselineWins:losses,exhausted:0,
            candidateSeats:{games:seats,gap:.1},baselineSeats:{games:seats,gap:.1},
            pairedBlockBootstrap:{valid:true,blockCount:games/players,confidenceInterval:interval},
        }],
        totals:{games,candidateWins:wins,baselineWins:losses},
    };
}
runTest('league review treats seat-paired seed73 71-49 as inconclusive when bootstrap includes 50%', ()=>{
    const r=row(make('seed73','seed76',71,49,{lower:.4917,upper:.6815}));
    assert.strictEqual(r.verdict,'inconclusive');
    assert.strictEqual(r.candidateShare,71/120);
    assert.strictEqual(r.maxCandidateSeatGap,.1);
});
runTest('league review only calls a candidate favored when paired 95% interval excludes half', ()=>{
    const r=row(make('seed104','seed103',55,17,{lower:.60,upper:.82},4));
    assert.strictEqual(r.verdict,'candidate-favored');
    assert.strictEqual(r.cpuWins,8);
});
runTest('league review rejects absent rotation, duplicate pairs, and incomplete matches', ()=>{
    const original=make('a','b',60,60,{lower:.41,upper:.59});
    assert.throws(()=>row({...original,pairedSeats:false}),/paired-seat/);
    assert.throws(()=>row({...original,entries:[{...original.entries[0],candidateSeats:{games:[120,0],gap:1}}]}),/unequal observed/);
    assert.throws(()=>assess([original,original]),/duplicate paired comparison/);
});
runTest('league review produces markdown with paired caveats',()=>{
    const x=assess([make('a','b',71,49,{lower:.49,upper:.68})]);
    assert.ok(markdown(x).includes('uncorrected for multiple comparisons'));
    assert.ok(markdown(x).includes('inconclusive'));
});
