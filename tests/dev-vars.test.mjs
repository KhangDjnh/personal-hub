import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readDevVars, upsertDevVars } from '../scripts/lib/dev-vars.mjs';

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('dev-vars helper', () => {
  it('updates existing keys in place while preserving comments and other keys', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-vars-'));
    tempDirs.push(dir);

    fs.writeFileSync(
      path.join(dir, '.dev.vars'),
      [
        '# Auth config',
        'AUTH_USERNAME=admin',
        'AUTH_PEPPER=placeholder',
        'GOOGLE_REFRESH_TOKEN=keep-me',
        '',
      ].join('\n'),
      'utf8'
    );

    upsertDevVars(
      {
        AUTH_USERNAME: 'khang',
        AUTH_PEPPER: 'new-pepper',
        JWT_SECRET: 'new-jwt',
      },
      dir
    );

    const parsed = readDevVars(dir);
    expect(parsed).toEqual({
      AUTH_USERNAME: 'khang',
      AUTH_PEPPER: 'new-pepper',
      GOOGLE_REFRESH_TOKEN: 'keep-me',
      JWT_SECRET: 'new-jwt',
    });

    const raw = fs.readFileSync(path.join(dir, '.dev.vars'), 'utf8');
    expect(raw).toContain('# Auth config');
  });
});
