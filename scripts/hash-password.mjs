#!/usr/bin/env node
import { webcrypto } from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readDevVars, upsertDevVars } from './lib/dev-vars.mjs';

const ITERATIONS = 50_000;

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  webcrypto.getRandomValues(bytes);
  return toHex(bytes);
}

function isPlaceholder(value) {
  return !value || value.startsWith('thay_bang_') || value.includes('<');
}

async function hashPassword(password, pepper) {
  const encoder = new TextEncoder();
  const salt = new Uint8Array(16);
  webcrypto.getRandomValues(salt);

  const keyMaterial = await webcrypto.subtle.importKey(
    'raw',
    encoder.encode(`${pepper}:${password}`),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await webcrypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(derivedBits))}`;
}

async function main() {
  const existingVars = readDevVars();
  const rl = readline.createInterface({ input, output });

  try {
    const defaultUser = existingVars.AUTH_USERNAME || 'admin';
    const username =
      (await rl.question(`Tên đăng nhập (Enter để dùng "${defaultUser}"): `)).trim() || defaultUser;
    const password = await rl.question('Mật khẩu muốn đặt cho Hub (tối thiểu 8 ký tự): ');

    if (!password || password.length < 8) {
      console.error('\nLỗi: Mật khẩu phải dài ít nhất 8 ký tự.');
      process.exitCode = 1;
      return;
    }

    const pepper = !isPlaceholder(existingVars.AUTH_PEPPER)
      ? existingVars.AUTH_PEPPER
      : randomHex(32);
    const jwtSecret = !isPlaceholder(existingVars.JWT_SECRET)
      ? existingVars.JWT_SECRET
      : randomHex(32);
    const passwordHash = await hashPassword(password, pepper);

    const varsPath = upsertDevVars({
      AUTH_USERNAME: username,
      AUTH_PEPPER: pepper,
      AUTH_PASSWORD_HASH: passwordHash,
      JWT_SECRET: jwtSecret,
    });

    console.log(`\nĐã tự động lưu thông tin đăng nhập vào: ${varsPath}`);
    console.log(`Tài khoản: ${username}\n`);
    console.log('=== Giá trị dùng khi nạp lên Cloudflare Workers (wrangler secret put) ===\n');
    console.log(`AUTH_USERNAME=${username}`);
    console.log(`AUTH_PEPPER=${pepper}`);
    console.log(`AUTH_PASSWORD_HASH=${passwordHash}`);
    console.log(`JWT_SECRET=${jwtSecret}\n`);
  } finally {
    rl.close();
  }
}

main();
