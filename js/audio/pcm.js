/* Plain browser helper shared by Voice and Song; usable from file://.
   Source PCM only: no normalisation, effects, resampling or channel mixing. */
(function(){
  "use strict";
  function pack24(channels){
    const n = channels[0].length, ch = channels.length;
    const out = new Uint8Array(n * ch * 3);
    let o = 0;
    for(let i = 0; i < n; i++) for(let c = 0; c < ch; c++){
      const x = channels[c][i];
      const v = x >= 1 ? 8388607 : x <= -1 ? -8388608 : Math.round(x * 8388607);
      out[o++] = v & 255; out[o++] = (v >> 8) & 255; out[o++] = (v >> 16) & 255;
    }
    return out;
  }
  function wav(parts, dataBytes, sampleRate, channels){
    if(!Number.isInteger(dataBytes) || dataBytes < 0 || dataBytes > 0xffffffff - 37 ||
       !Number.isInteger(sampleRate) || sampleRate < 1 || ![1,2].includes(channels) ||
       dataBytes % (channels * 3)) throw new Error("Invalid PCM WAV dimensions");
    const h = new DataView(new ArrayBuffer(44)), pad = dataBytes % 2;
    const str = (o,s) => { for(let i=0; i<s.length; i++) h.setUint8(o+i,s.charCodeAt(i)); };
    str(0,"RIFF"); h.setUint32(4,36 + dataBytes + pad,true); str(8,"WAVE");
    str(12,"fmt "); h.setUint32(16,16,true); h.setUint16(20,1,true);
    h.setUint16(22,channels,true); h.setUint32(24,sampleRate,true);
    h.setUint32(28,sampleRate * channels * 3,true); h.setUint16(32,channels * 3,true);
    h.setUint16(34,24,true); str(36,"data"); h.setUint32(40,dataBytes,true);
    return new Blob([h.buffer,...parts,...(pad ? [new Uint8Array(1)] : [])],{type:"audio/wav"});
  }
  window.ScuLaPCM = Object.freeze({pack24,wav});
})();
