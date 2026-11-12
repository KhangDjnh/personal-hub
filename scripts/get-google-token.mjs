#!/usr/bin/env node
import http from 'node:http';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { exec } from 'node:child_process';
import { readDevVars, upsertDevVars } from './lib/dev-vars.mjs';

const PORT = 43210;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/drive';

function openBrowser(url) {
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {
    // Ignore error if headless; user can copy the printed URL manually.
  });
}

async function main() {
  const devVars = readDevVars();
  const rl = readline.createInterface({ input, output });

  let clientId = devVars.GOOGLE_CLIENT_ID || '';
  let clientSecret = devVars.GOOGLE_CLIENT_SECRET || '';

  try {
    if (!clientId || clientId.startsWith('your-')) {
      clientId = (await rl.question('Nhập GOOGLE_CLIENT_ID: ')).trim();
    } else {
      console.log(`Đang dùng GOOGLE_CLIENT_ID từ .dev.vars: ${clientId}`);
    }

    if (!clientSecret || clientSecret.startsWith('your-')) {
      clientSecret = (await rl.question('Nhập GOOGLE_CLIENT_SECRET: ')).trim();
    }
  } finally {
    rl.close();
  }

  if (!clientId || !clientSecret) {
    console.error('Thiếu GOOGLE_CLIENT_ID hoặc GOOGLE_CLIENT_SECRET.');
    process.exit(1);
  }

  console.log(`\nĐảm bảo bạn đã thêm Redirect URI sau trong Google Cloud Console -> Credentials:`);
  console.log(`  ${REDIRECT_URI}\n`);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  const server = http.createServer(async (req, res) => {
    if (!req.url?.startsWith('/callback')) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const reqUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const error = reqUrl.searchParams.get('error');
    const code = reqUrl.searchParams.get('code');

    if (error || !code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h2>Xác thực thất bại</h2><p>${error ?? 'Không nhận được authorization code.'}</p>`);
      server.close();
      process.exit(1);
    }

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      const data = await tokenRes.json();
      if (!tokenRes.ok || !data.refresh_token) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<pre>${JSON.stringify(data, null, 2)}</pre>`);
        console.error('Lỗi lấy refresh_token:', data);
        server.close();
        process.exit(1);
      }

      const varsPath = upsertDevVars({
        GOOGLE_CLIENT_ID: clientId,
        GOOGLE_CLIENT_SECRET: clientSecret,
        GOOGLE_REFRESH_TOKEN: data.refresh_token,
      });

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<h2>Thành công!</h2><p>Đã tự động lưu GOOGLE_REFRESH_TOKEN vào .dev.vars. Bạn có thể đóng tab này.</p>'
      );

      console.log(`\n=== LẤY TOKEN THÀNH CÔNG ===`);
      console.log(`Đã tự động lưu GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET và GOOGLE_REFRESH_TOKEN vào: ${varsPath}\n`);
      console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}\n`);
      console.log('Lưu ý: Nếu OAuth Consent Screen của bạn đang ở trạng thái "Testing",');
      console.log('token sẽ hết hạn sau 7 ngày. Hãy bấm "Publish App" (In production) trước khi lấy token!\n');
      server.close();
    } catch (err) {
      res.writeHead(500);
      res.end('Token exchange failed');
      console.error(err);
      server.close();
      process.exit(1);
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log('Đang mở trình duyệt để đăng nhập Google...\nNếu không tự mở, hãy mở link sau:\n');
    console.log(authUrl.toString(), '\n');
    openBrowser(authUrl.toString());
  });
}

main();
