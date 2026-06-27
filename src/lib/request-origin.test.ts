import { test } from "node:test";
import assert from "node:assert/strict";
import { publicOrigin } from "./request-origin";

const reqWith = (headers: Record<string, string>, url = "http://internal.local/api/telegram/setup-webhook") =>
  new Request(url, { method: "POST", headers });

test("publicOrigin 優先採用瀏覽器 Origin", () => {
  const req = reqWith({ origin: "https://iwantpo.example.app", "x-forwarded-host": "evil.example" });
  assert.equal(publicOrigin(req), "https://iwantpo.example.app");
});

test("publicOrigin 強制 https（Origin 為 http 也轉 https）", () => {
  const req = reqWith({ origin: "http://iwantpo.example.app" });
  assert.equal(publicOrigin(req), "https://iwantpo.example.app");
});

test("publicOrigin 無 Origin 時退用 x-forwarded-host，仍強制 https", () => {
  const req = reqWith({ "x-forwarded-host": "iwantpo.example.app", "x-forwarded-proto": "http" });
  assert.equal(publicOrigin(req), "https://iwantpo.example.app");
});

test("publicOrigin 無 Origin／無 forwarded 時退用 Host", () => {
  const req = reqWith({ host: "iwantpo.example.app" });
  assert.equal(publicOrigin(req), "https://iwantpo.example.app");
});

test("publicOrigin 畸形 Origin 落到後備 host", () => {
  const req = reqWith({ origin: "not a url", host: "iwantpo.example.app" });
  assert.equal(publicOrigin(req), "https://iwantpo.example.app");
});
