// Compare the tagged 2.0.0 implementation with the current backup implementation.
// Node supplies random bytes and module stubs; WebCrypto is disabled to exercise the Hermes-compatible JS path.
const assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");
const fs = require("node:fs/promises");
const { execFileSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const ts = require("typescript");

function compile(source, dependencies = {}) {
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const load = (name) =>
    Object.prototype.hasOwnProperty.call(dependencies, name)
      ? dependencies[name]
      : require(name);
  new Function("require", "module", "exports", code)(
    load,
    module,
    module.exports,
  );
  return module.exports;
}
function tagged(filename) {
  return execFileSync("git", ["show", `2.0.0:${filename}`], {
    encoding: "utf8",
  });
}
function median(values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}
async function samples(action) {
  const values = [];
  for (let index = 0; index < 3; index++) {
    const start = performance.now();
    await action();
    values.push(Math.round(performance.now() - start));
  }
  return { medianMs: median(values), samplesMs: values };
}
async function main() {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "crypto",
  );
  Object.defineProperty(globalThis, "crypto", {
    value: undefined,
    configurable: true,
  });
  try {
    const shared = compile(await fs.readFile("shared/cardbox.ts", "utf8"));
    const baselineKdf = compile(tagged("lib/cardbox-pbkdf2.ts"));
    const currentKdf = compile(
      await fs.readFile("lib/cardbox-pbkdf2.ts", "utf8"),
    );
    const dependencies = {
      "react-native": { Platform: { OS: "android" } },
      "expo-secure-store": {},
      "expo-crypto": {
        getRandomBytesAsync: async (size) => new Uint8Array(randomBytes(size)),
      },
      "../shared/cardbox": shared,
    };
    const before = compile(tagged("lib/cardbox-security.ts"), {
      ...dependencies,
      "./cardbox-pbkdf2": baselineKdf,
    });
    const after = compile(
      await fs.readFile("lib/cardbox-security.ts", "utf8"),
      { ...dependencies, "./cardbox-pbkdf2": currentKdf },
    );
    const password = "benchmark-only-password";
    const report = {
      environment: `Node ${process.version}; desktop JS fallback, not Android measurements`,
      generatedAt: new Date().toISOString(),
      baseline: "2.0.0 (7100e97)",
      rows: [],
    };
    for (const imageBytes of [0, 64 * 1024]) {
      const cards = Array.from({ length: 10 }, (_, index) => ({
        id: `sample-${index}`,
        name: `Sample ${index}`,
        number: "1234567890123456",
        cvv: "",
        expiry: "",
        note: "synthetic benchmark data",
        tone: "#2F59C7",
        type: "debit",
        ...(imageBytes
          ? {
              imageData: Buffer.alloc(imageBytes, index).toString("base64"),
              imageMime: "image/jpeg",
            }
          : {}),
      }));
      const value = JSON.stringify({ version: 3, cards });
      for (const [name, implementation] of [
        ["2.0 v3", before],
        ["3.0 v4", after],
      ]) {
        const backup = await implementation.encryptBackup(value, password);
        const row = {
          name,
          plaintextBytes: Buffer.byteLength(value),
          fileBytes: Buffer.byteLength(backup),
        };
        row.export = await samples(async () => {
          const raw = await implementation.encryptBackup(value, password);
          assert(JSON.parse(raw).format.startsWith("cardbox-secure-"));
        });
        row.import = await samples(async () =>
          assert.equal(
            await implementation.decryptBackup(backup, password),
            value,
          ),
        );
        row.wrongPassword = await samples(async () => {
          await assert.rejects(
            implementation.decryptBackup(backup, "wrong-password"),
          );
        });
        report.rows.push(row);
        console.log(
          name,
          row.plaintextBytes,
          "bytes",
          "export",
          row.export.medianMs,
          "import",
          row.import.medianMs,
          "wrong",
          row.wrongPassword.medianMs,
          "ms",
        );
      }
    }
    await fs.mkdir(".expo", { recursive: true });
    await fs.writeFile(
      ".expo/cardbox-backup-benchmark.json",
      JSON.stringify(report, null, 2) + "\n",
    );
  } finally {
    if (cryptoDescriptor)
      Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
    else delete globalThis.crypto;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
