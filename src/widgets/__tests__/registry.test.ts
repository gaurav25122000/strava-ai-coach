import { WIDGET_REGISTRY } from '../registry';
import { DEFAULT_WIDGET_LAYOUT, WIDGET_FAMILY, WIDGET_TITLES } from '../../utils/widgetFamilies';

// The registry, family map, titles and default layout must never drift —
// three divergent widget-id lists caused the old "fresh installs never get
// TodayHero" bug.

describe('widget registry consistency', () => {
  const registryIds = Object.keys(WIDGET_REGISTRY).sort();

  it('matches WIDGET_FAMILY exactly', () => {
    expect(registryIds).toEqual(Object.keys(WIDGET_FAMILY).sort());
  });

  it('every widget has a title', () => {
    expect(registryIds).toEqual(Object.keys(WIDGET_TITLES).sort());
  });

  it('default layout only references real widgets, TodayHero first', () => {
    for (const id of DEFAULT_WIDGET_LAYOUT) {
      expect(WIDGET_REGISTRY[id]).toBeDefined();
    }
    expect(DEFAULT_WIDGET_LAYOUT[0]).toBe('TodayHero');
  });
});
