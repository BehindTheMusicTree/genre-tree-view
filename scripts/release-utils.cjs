const fs = require('node:fs');

function releaseSection(text, heading) {
  const lines = text.split(/\r?\n/);
  let fence = null;
  const headings = [];
  for (const [index, line] of lines.entries()) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (!fence && line.startsWith('## ')) headings.push({ index, line });
  }
  const matches = headings.filter(item => item.line === heading);
  if (matches.length !== 1) throw new Error(`Expected exactly one ${heading} section outside code fences`);
  const start = matches[0].index;
  const end = headings.find(item => item.index > start)?.index ?? lines.length;
  const body = lines.slice(start + 1, end).join('\n').replace(/<!--[\s\S]*?-->/g, '').replace(/^#{1,6}\s.*$/gm, '').trim();
  if (!body) throw new Error(`${heading} has no release notes`);
  return { lines, start, headings };
}

function main() {
  const [command, bump] = process.argv.slice(2);
  const version = JSON.parse(fs.readFileSync('packages/genre-tree-view/package.json', 'utf8')).version;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('Expected stable SemVer');
  const text = fs.readFileSync('CHANGELOG.md', 'utf8');
  const { lines, start, headings } = releaseSection(text, '## [Unreleased]');
  let target = version;
  if (command === 'check') {
    const index = ['major', 'minor', 'patch'].indexOf(bump);
    if (index < 0) throw new Error('Expected major, minor or patch');
    const parts = version.split('.').map(BigInt);
    parts[index] += 1n;
    for (let i = index + 1; i < 3; i++) parts[i] = 0n;
    target = parts.join('.');
  } else if (command !== 'prepare') throw new Error('Expected check or prepare');
  if (headings.some(item => item.line.startsWith(`## [${target}]`))) throw new Error(`Changelog already contains ${target}`);
  if (command === 'prepare') {
    lines.splice(start + 1, 0, '', `## [${target}] - ${new Date().toISOString().slice(0, 10)}`);
    fs.writeFileSync('CHANGELOG.md', lines.join('\n'));
  }
}

module.exports = { releaseSection };
if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
