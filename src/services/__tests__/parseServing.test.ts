import { FOOD_LIBRARY, parseServing, unitLabel } from '../foodLibrary';

describe('parseServing', () => {
  it('weight servings: "100 g", "330 ml" → weight mode with base amount', () => {
    expect(parseServing('100 g')).toEqual({
      mode: 'weight', count: 1, unit: 'g', baseWeight: 100, weightUnit: 'g',
    });
    expect(parseServing('1 can (330 ml)').mode).toBe('servings'); // can is the unit, not weight
    expect(parseServing('330 ml')).toMatchObject({ mode: 'weight', baseWeight: 330, weightUnit: 'ml' });
    expect(parseServing('150 g cooked')).toMatchObject({ mode: 'weight', baseWeight: 150 });
  });

  it('countable servings: "6 pieces", "23 nuts (28 g)" → pieces mode', () => {
    expect(parseServing('6 pieces')).toMatchObject({ mode: 'pieces', count: 6, unit: 'pieces' });
    expect(parseServing('23 nuts (28 g)')).toMatchObject({ mode: 'pieces', count: 23, unit: 'nuts' });
    expect(parseServing('4 squares (28 g)')).toMatchObject({ mode: 'pieces', count: 4, unit: 'squares' });
    expect(parseServing('2 rotis')).toMatchObject({ mode: 'pieces', count: 2 });
  });

  it('single servings: "1 medium", "1 bar (44 g)", "⅔ cup" → servings mode', () => {
    expect(parseServing('1 medium')).toMatchObject({ mode: 'servings', count: 1, unit: 'medium' });
    expect(parseServing('1 bar (44 g)')).toMatchObject({ mode: 'servings', unit: 'bar' });
    expect(parseServing('⅔ cup')).toMatchObject({ mode: 'servings', count: 1 });
    expect(parseServing('1 katori')).toMatchObject({ mode: 'servings' });
  });

  it('never throws on any library serving and always yields a usable mode', () => {
    for (const f of FOOD_LIBRARY) {
      const p = parseServing(f.serving);
      expect(['pieces', 'weight', 'servings']).toContain(p.mode);
      if (p.mode === 'pieces') expect(p.count).toBeGreaterThan(1);
      if (p.mode === 'weight') expect(p.baseWeight).toBeGreaterThan(0);
    }
  });
});

describe('unitLabel', () => {
  it('singularises only at n === 1', () => {
    expect(unitLabel(4, 'pieces')).toBe('pieces');
    expect(unitLabel(1, 'pieces')).toBe('piece');
    expect(unitLabel(1, 'halves')).toBe('half');
    expect(unitLabel(2, 'rotis')).toBe('rotis');
  });
});
