#!/usr/bin/env node
// Puts the on-device model and its WebAssembly runtime into public/, verifying every
// file against a pinned SHA-256. Fails if any file wouldn't fit Cloudflare's asset limit.

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const MAX_ASSET_BYTES = 25 * 1024 * 1024;

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const MODEL_REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
const MODEL_FILES = {
  'config.json': '7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7',
  'tokenizer.json': 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0',
  'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3',
  'onnx/model_quantized.onnx': 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1',
};

const RUNTIME_DIR = 'node_modules/onnxruntime-web/dist';
const RUNTIME_FILES = {
  'ort-wasm-simd-threaded.wasm': '06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3',
  'ort-wasm-simd-threaded.mjs': 'c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f',
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const checkBytes = (name, bytes, expectedHash) => {
  const actualHash = sha256(bytes);
  if (actualHash !== expectedHash) {
    throw new Error(`${name}: expected SHA-256 ${expectedHash}, got ${actualHash}`);
  }
  if (bytes.length > MAX_ASSET_BYTES) {
    throw new Error(`${name}: ${bytes.length} bytes exceeds the ${MAX_ASSET_BYTES} byte asset limit`);
  }
};

const readIfPresent = (path) => readFile(path).catch(() => null);

const fetchModelFile = async (name, expectedHash) => {
  const target = join('public/models', MODEL_ID, name);
  const existing = await readIfPresent(target);
  if (existing !== null && sha256(existing) === expectedHash) return `kept ${target}`;
  const response = await fetch(
    `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/${name}`,
  );
  if (!response.ok) throw new Error(`${name}: download failed with HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  checkBytes(name, bytes, expectedHash);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return `fetched ${target}`;
};

const copyRuntimeFile = async (name, expectedHash) => {
  const source = join(RUNTIME_DIR, name);
  checkBytes(name, await readFile(source), expectedHash);
  const target = join('public/ort', name);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  return `copied ${target}`;
};

const main = async () => {
  for (const [name, hash] of Object.entries(MODEL_FILES)) {
    console.log(await fetchModelFile(name, hash));
  }
  for (const [name, hash] of Object.entries(RUNTIME_FILES)) {
    console.log(await copyRuntimeFile(name, hash));
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
