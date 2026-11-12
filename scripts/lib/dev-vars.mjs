import fs from 'node:fs';
import path from 'node:path';

export function getDevVarsPath(cwd = process.cwd()) {
  return path.resolve(cwd, '.dev.vars');
}

export function readDevVars(cwd = process.cwd()) {
  const varsPath = getDevVarsPath(cwd);
  if (!fs.existsSync(varsPath)) return {};

  const result = {};
  for (const line of fs.readFileSync(varsPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      result[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
    }
  }
  return result;
}

export function upsertDevVars(updates, cwd = process.cwd()) {
  const varsPath = getDevVarsPath(cwd);
  const examplePath = path.resolve(cwd, '.dev.vars.example');

  let content = '';
  if (fs.existsSync(varsPath)) {
    content = fs.readFileSync(varsPath, 'utf8');
  } else if (fs.existsSync(examplePath)) {
    content = fs.readFileSync(examplePath, 'utf8');
  }

  const lines = content ? content.split(/\r?\n/) : [];
  const remaining = new Map(Object.entries(updates));

  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) return line;
    const key = line.slice(0, eqIndex).trim();
    if (remaining.has(key)) {
      const value = remaining.get(key);
      remaining.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });

  for (const [key, value] of remaining.entries()) {
    updatedLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(varsPath, `${updatedLines.join('\n').replace(/\n+$/g, '')}\n`, 'utf8');
  return varsPath;
}

