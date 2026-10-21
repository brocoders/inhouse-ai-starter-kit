// Five screens fit; six do not, and the overflow is what "More" opens.
//
//   node --test frontend/src/components/shell/tab-layout.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tabBarLayout } from './tab-layout.ts';

describe('the phone tab bar', () => {
  it('shows up to five screens as five tabs and nothing under More', () => {
    assert.deepEqual(tabBarLayout(['a', 'b', 'c']), { tabs: ['a', 'b', 'c'], more: [] });
    assert.deepEqual(tabBarLayout(['a', 'b', 'c', 'd', 'e']), {
      tabs: ['a', 'b', 'c', 'd', 'e'],
      more: [],
    });
  });

  it('keeps the first four and puts the rest under More from six screens on', () => {
    assert.deepEqual(tabBarLayout(['a', 'b', 'c', 'd', 'e', 'f']), {
      tabs: ['a', 'b', 'c', 'd'],
      more: ['e', 'f'],
    });
    assert.deepEqual(tabBarLayout(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']).more, [
      'e',
      'f',
      'g',
      'h',
    ]);
  });

  it('has nothing to show for no screens', () => {
    assert.deepEqual(tabBarLayout([]), { tabs: [], more: [] });
  });
});
