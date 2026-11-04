const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { once } = require("node:events");
const http = require("node:http");
const vm = require("node:vm");

// Resolve the real transitive packages through their consumers, without SDK mocks.
const functionsRequire = createRequire(require.resolve("firebase-functions"));
const expressRequire = createRequire(functionsRequire.resolve("express"));
const axiosRequire = createRequire(require.resolve("axios"));
const qs = expressRequire("qs");
const redirects = axiosRequire("follow-redirects");

// A vulnerable decoder can terminate the process, so isolate only that probe.
async function compressedRequest(parserPath, encoding, trailingBytes) {
  const assert = require("node:assert/strict");
  const http = require("node:http");
  const { once } = require("node:events");
  const { setTimeout: delay } = require("node:timers/promises");
  const zlib = require("node:zlib");
  const parser = require(parserPath).json();
  const payload = '{"message":"synthetic"}';
  const frame = encoding === "gzip" ? zlib.gzipSync(payload) : zlib.deflateSync(payload);
  const first = trailingBytes ? Buffer.concat([frame, Buffer.from([0])]) : frame;
  const trailing = trailingBytes ? Buffer.alloc(100 * 1024, 0x58) : Buffer.alloc(0);
  let client;
  const server = http.createServer((req, res) => {
    parser(req, res, error => {
      const respond = () => {
        res.statusCode = error ? error.status : 200;
        res.end(error ? "invalid body" : JSON.stringify(req.body));
      };
      // The next middleware may wait for all HTTP bytes after parsing.
      if (trailingBytes && encoding === "deflate") {
        req.once("end", respond);
        client.end(trailing);
      } else respond();
    });
  });
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const response = await new Promise((resolve, reject) => {
      client = http.request({
        host: "127.0.0.1", port: server.address().port, method: "POST", agent: false,
        headers: { "Content-Type": "application/json", "Content-Encoding": encoding,
          "Content-Length": first.length + trailing.length },
      }, res => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", chunk => { body += chunk; });
        res.on("error", reject);
        res.on("end", () => resolve({ status: res.statusCode, body }));
      });
      client.on("error", reject);
      client.setTimeout(2000, () => client.destroy(new Error("local parser request timed out")));
      if (trailingBytes && encoding === "deflate") client.write(first);
      else client.end(Buffer.concat([first, trailing]));
    });
    // Give any late decompressor error a chance to surface before exiting.
    await delay(200);
    assert.equal(response.status, 200);
    assert.equal(response.body, payload);
  } finally {
    if (client) client.destroy();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

for (const [encoding, trailingBytes] of [["gzip", true], ["deflate", true], ["gzip", false]]) {
  test(`real body-parser handles ${encoding} ${trailingBytes ? "with trailing bytes without a process crash" : "JSON normally"}`, () => {
    const script = `(${compressedRequest.toString()})(${JSON.stringify(expressRequire.resolve("body-parser"))}, ${JSON.stringify(encoding)}, ${trailingBytes}).catch(error => { console.error(error); process.exitCode = 1; });`;
    execFileSync(process.execPath, ["-e", script], { timeout: 10000, stdio: "pipe" });
  });
}

for (const encodeValuesOnly of [false, true]) {
  test(`real qs comma serialization handles untrusted object elements (encodeValuesOnly=${encodeValuesOnly})`, () => {
    const sources = [
      JSON.parse('{"a":[{"toString":"x"}]}'),
      qs.parse("a[0][toString]=x", { allowPrototypes: true }),
      qs.parse("a[0][b]=c", { plainObjects: true }),
      JSON.parse('{"a":[[{"toString":null}]]}'),
    ];
    for (const input of sources) {
      assert.equal(qs.stringify(input, { arrayFormat: "comma", encodeValuesOnly }), "a=%5Bobject%20Object%5D");
    }
    assert.equal(qs.stringify({ a: ["first", "second"] }, { arrayFormat: "comma", encodeValuesOnly }),
      encodeValuesOnly ? "a=first,second" : "a=first%2Csecond");
  });
}

test("real follow-redirects strips declared cross-realm credentials on cross-origin redirects", async t => {
  const received = [];
  const target = http.createServer((req, res) => { received.push(req.headers); res.end("synthetic response"); });
  const origin = http.createServer((req, res) => {
    res.writeHead(302, { Location: `http://127.0.0.1:${target.address().port}/target` });
    res.end();
  });
  t.after(async () => {
    for (const server of [origin, target]) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
  for (const server of [target, origin]) {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
  }
  for (const crossRealm of [false, true]) {
    for (const arrayHeaders of [false, true]) {
      const sensitiveHeaders = crossRealm ? vm.runInNewContext('["X-API-Key"]') : ["X-API-Key"];
      const headers = { Host: `127.0.0.1:${origin.address().port}`,
        "X-API-Key": "synthetic-key", Authorization: "Bearer synthetic-token",
        Cookie: "synthetic=session", "X-Harmless": "control" };
      await t.test(`crossRealm=${crossRealm}, arrayHeaders=${arrayHeaders}`, async () => {
        await new Promise((resolve, reject) => {
          const request = redirects.http.get(`http://127.0.0.1:${origin.address().port}/origin`, {
            headers: arrayHeaders ? Object.entries(headers).flat() : headers, sensitiveHeaders, agent: false,
          }, res => {
            assert.equal(res.statusCode, 200);
            res.resume();
            res.on("error", reject);
            res.on("end", resolve);
          });
          request.on("error", reject);
          request.setTimeout(2000, () => request.destroy(new Error("local redirect request timed out")));
        });
        const redirected = received.at(-1);
        assert.equal(redirected["x-api-key"], undefined);
        assert.equal(redirected.authorization, undefined);
        assert.equal(redirected.cookie, undefined);
        assert.equal(redirected["x-harmless"], "control");
      });
    }
  }
  assert.equal(received.length, 4);
});
