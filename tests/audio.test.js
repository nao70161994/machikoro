const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const contexts = [];
class FakeAudioParam {
    constructor() {
        this.value = 0;
        this.ramps = [];
    }
    setValueAtTime(value, time) { this.ramps.push(['set', value, time]); }
    linearRampToValueAtTime(value, time) { this.ramps.push(['linear', value, time]); }
    exponentialRampToValueAtTime(value, time) { this.ramps.push(['exponential', value, time]); }
}

class FakeAudioContext {
    constructor() {
        this.sampleRate = 48000;
        this.currentTime = 10;
        this.destination = {};
        this.state = 'running';
        this.oscillators = [];
        this.gains = [];
        contexts.push(this);
    }
    createOscillator() {
        const oscillator = {
            frequency: new FakeAudioParam(),
            connect() {},
            start() {},
            stop() {},
        };
        this.oscillators.push(oscillator);
        return oscillator;
    }
    createGain() {
        const gain = { gain: new FakeAudioParam(), connect() {} };
        this.gains.push(gain);
        return gain;
    }
}

const sandbox = {
    window: { AudioContext: FakeAudioContext },
    Math,
    Number,
    Object,
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/audio.js'), 'utf8'), sandbox);

sandbox.playSound('coin');
const audioContext = contexts[0];
assert.deepStrictEqual(audioContext.oscillators.map(oscillator => oscillator.frequency.value), [523, 659]);
assert.strictEqual(audioContext.gains.length, 2);

audioContext.oscillators.length = 0;
audioContext.gains.length = 0;
sandbox.playSound('coin', { large: true });
assert.deepStrictEqual(audioContext.oscillators.map(oscillator => oscillator.frequency.value), [523, 659, 784]);
assert.strictEqual(audioContext.gains.length, 3);
assert.ok(audioContext.gains.every(gain => gain.gain.ramps.some(ramp => ramp[0] === 'linear' && ramp[1] === 0.13)));

const beforeDisabled = audioContext.oscillators.length;
sandbox.setSoundEffectEnabled('coin', false);
sandbox.playSound('coin', { large: true });
assert.strictEqual(audioContext.oscillators.length, beforeDisabled);

sandbox.setSoundEffectEnabled('coin', true);
sandbox.setSoundVolume(0);
sandbox.playSound('coin', { large: true });
assert.strictEqual(audioContext.oscillators.length, beforeDisabled);

console.log('audio tests passed');
