import { normaliseMealSuggestions, rpeAnnotation } from '../ai';

describe('rpeAnnotation', () => {
  it('returns empty string when no entry', () => {
    expect(rpeAnnotation(undefined)).toBe('');
  });

  it('renders RPE alone', () => {
    expect(rpeAnnotation({ rpe: 7 })).toBe(' · RPE 7/10');
  });

  it('maps mood 5→great and 1→rough', () => {
    expect(rpeAnnotation({ mood: 5 })).toBe(' · felt: great');
    expect(rpeAnnotation({ mood: 1 })).toBe(' · felt: rough');
  });

  it('combines RPE, mood and note', () => {
    expect(rpeAnnotation({ rpe: 8, mood: 2, note: 'legs heavy' })).toBe(
      ' · RPE 8/10 · felt: meh (legs heavy)',
    );
  });

  it('renders a note without rpe/mood', () => {
    expect(rpeAnnotation({ note: 'windy' })).toBe(' (windy)');
  });
});

describe('normaliseMealSuggestions', () => {
  const valid = {
    name: 'Paneer bhurji + 2 rotis',
    description: 'Crumbled paneer with onion-tomato masala and two phulkas.',
    calories: 480.4,
    protein: 28.6,
    carbs: 42,
    fat: 18,
  };

  it('rounds numbers and keeps all fields', () => {
    const out = normaliseMealSuggestions({ suggestions: [valid] });
    expect(out).toEqual([
      {
        name: 'Paneer bhurji + 2 rotis',
        description: 'Crumbled paneer with onion-tomato masala and two phulkas.',
        calories: 480,
        protein: 29,
        carbs: 42,
        fat: 18,
      },
    ]);
  });

  it('drops entries missing name or calories and caps at 3', () => {
    const out = normaliseMealSuggestions({
      suggestions: [
        { ...valid, name: '' },
        { ...valid, calories: 'lots' },
        valid,
        valid,
        valid,
        valid,
      ],
    });
    expect(out).toHaveLength(3);
  });

  it('defaults missing macros to 0 and tolerates garbage input', () => {
    const out = normaliseMealSuggestions({
      suggestions: [{ name: 'Idli sambar', calories: 300 }],
    });
    expect(out[0]).toEqual({
      name: 'Idli sambar',
      description: '',
      calories: 300,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    expect(normaliseMealSuggestions(null)).toEqual([]);
    expect(normaliseMealSuggestions({ suggestions: 'nope' })).toEqual([]);
  });
});
