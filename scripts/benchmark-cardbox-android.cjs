// Run only synthetic cryptographic data on an already connected Expo Go / Hermes.
// No card repository, picker, backup file, or user password is read or modified.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { pbkdf2Sync } = require("node:crypto");

async function main() {
  const port = process.env.CARDBOX_METRO_PORT || "8081";
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  const target = targets.filter((t) => t.appId === "host.exp.exponent").at(-1);
  if (!target)
    throw Error("Open CardBox in the connected phone's Expo Go first.");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const response = JSON.parse(data);
    if (response.id) pending.get(response.id)?.(response);
  };
  const call = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error("Inspector timed out"));
      }, 30000);
      pending.set(id, (response) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(response);
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const response = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    if (response.error || response.result?.exceptionDetails)
      throw Error(JSON.stringify(response));
    return response.result.result.value;
  };
  try {
    await call("Runtime.enable", {});
    const expected = pbkdf2Sync(
      "test",
      new Uint8Array(16).fill(7),
      120000,
      32,
      "sha256",
    ).toString("hex");
    // Avoid async-function syntax: Hermes eval accepts callbacks; Metro normally transpiles async.
    const start = `(function() {
      if (globalThis.__cardboxSyntheticBench && globalThis.__cardboxSyntheticBench.running) throw Error('Another synthetic benchmark is running');
      var modules=Array.from(__r.getModules());
      function load(name) {var e=modules.find(function(e){return e[1].verboseName===name;}); if(!e)throw Error('Missing '+name);return __r(e[0]);}
      var native=load('lib/cardbox-native-kdf.ts').getNativePasswordDeriver();
      if(!native)throw Error('Native worker not registered; fully reload the project');
      var kdf=load('lib/cardbox-pbkdf2.ts');
      var security=load('lib/cardbox-security.ts');
      var report={running:true,hermes:!!globalThis.HermesInternal,iterations:120000,rows:[],progress:'native derivation'};
      globalThis.__cardboxSyntheticBench=report;
      function hex(bytes) {return Array.from(bytes).map(function(b){return ('0'+b.toString(16)).slice(-2);}).join('');}
      function measure(name,action) {
        report.progress=name; var started=Date.now();
        return action().then(function(value){report.rows.push({name:name,milliseconds:Date.now()-started});return value;});
      }
      function derive(action) {return action(new Uint8Array([116,101,115,116]),new Uint8Array(16).fill(7),120000,32,1).then(function(bytes){if(hex(bytes)!==${JSON.stringify(expected)})throw Error('Independent PBKDF2 vector mismatch');bytes.fill(0);});}
      function backup(imageBytes) {
        var cards=Array.from({length:10},function(_,i){var card={id:'synthetic-'+i,name:'Synthetic '+i,number:'1234567890123456',cvv:'',expiry:'',note:'synthetic benchmark',tone:'#2F59C7',type:'debit'};
          if(imageBytes){card.imageData='A'.repeat(Math.ceil(imageBytes/3)*4);card.imageMime='image/jpeg';}return card;});
        var plain=JSON.stringify({version:3,cards:cards});
        var prefix='10 cards / '+imageBytes+' image bytes each / '+plain.length+' plaintext bytes';
        var encrypted;
        return measure(prefix+' export',function(){return security.encryptBackup(plain,'synthetic-only-password');})
          .then(function(raw){encrypted=raw;return measure(prefix+' import',function(){return security.decryptBackup(raw,'synthetic-only-password');});})
          .then(function(restored){if(restored!==plain)throw Error('Round trip mismatch');return measure(prefix+' wrong password',function(){return security.decryptBackup(encrypted,'wrong-password').then(function(){throw Error('Wrong password accepted');},function(error){if(error.message!=='密码不正确或备份已损坏。')throw error;});});});
      }
      setTimeout(function(){
        measure('native PBKDF2 120000 / 32 bytes',function(){return derive(native);})
        .then(function(){return backup(0);})
        .then(function(){return backup(65536);})
        .then(function(){return measure('3.0.0 Hermes JS PBKDF2 120000 / 32 bytes',function(){return derive(kdf.derivePasswordBytesFallback);});})
        .then(function(){report.running=false;report.progress='complete';},function(error){report.running=false;report.error=String(error);});
      },0);
      return 'Synthetic native benchmark queued';
    })()`;
    console.log(await evaluate(start));
    const deadline = Date.now() + 180000;
    let lastProgress;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const report = JSON.parse(
        await evaluate("JSON.stringify(globalThis.__cardboxSyntheticBench)"),
      );
      if (report.progress !== lastProgress) {
        console.log(report.progress);
        lastProgress = report.progress;
      }
      if (!report.running) {
        assert(!report.error, report.error);
        assert.equal(report.hermes, true);
        assert.equal(report.rows.length, 8);
        const record = {
          generatedAt: new Date().toISOString(),
          device: target.deviceName,
          environment:
            "Android Expo Go / Hermes + local system WebView WebCrypto; synthetic crypto only; excludes file I/O and system authentication",
          ...report,
        };
        await fs.mkdir(".expo", { recursive: true });
        await fs.writeFile(
          ".expo/cardbox-android-backup-benchmark.json",
          JSON.stringify(record, null, 2) + "\n",
        );
        console.log(JSON.stringify(record, null, 2));
        await evaluate(
          "delete globalThis.__cardboxSyntheticBench; 'synthetic state cleared'",
        );
        return;
      }
    }
    throw Error(
      "Benchmark did not finish; keep the phone unlocked with CardBox foreground.",
    );
  } finally {
    socket.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
