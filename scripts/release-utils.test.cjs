const { test } = require('node:test');
const assert = require('node:assert/strict');
const { releaseSection } = require('./release-utils.cjs');

test('changelog examples are preserved and never selected as release notes', () => {
  const text = '```markdown\n## [Unreleased]\n\n- Example\n```\n\n## [Unreleased]\n\n- Real notes\n\n## [1.0.0]\n- Old';
  const { start, lines } = releaseSection(text, '## [Unreleased]');
  assert.equal(start, 6);
  assert.equal(lines[start + 2], '- Real notes');
});

test('empty, heading-only, commented and duplicate sections fail', () => {
  for (const text of ['## [Unreleased]\n\n### Fixed\n', '## [Unreleased]\n<!-- draft -->', '## [Unreleased]\n- One\n## [Unreleased]\n- Two']) {
    assert.throws(() => releaseSection(text, '## [Unreleased]'));
  }
});
