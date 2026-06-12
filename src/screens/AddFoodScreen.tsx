import React, { useMemo, useState } from 'react';
import { ScrollView, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera, Check, ChevronLeft, Heart, Image as ImageIcon, Minus, Plus, Search, Sparkles, Trash2,
} from 'lucide-react-native';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { FieldBlock, SegmentedControl } from '../components/SheetUI';
import { Toggle } from '../components/Toggle';
import { Pulsing } from '../components/Pulsing';
import { theme, withAlpha } from '../theme';
import { familyStyle } from '../utils/widgetFamilies';
import {
  FOOD_CATEGORY_LABELS, FoodCategory, FoodItem, parseServing, searchFoods, unitLabel,
} from '../services/foodLibrary';
import { MEAL_LABELS, MEAL_ORDER } from '../services/calories';
import { AIService, FoodAnalysisItem } from '../services/ai';
import {
  FoodLogEntry, MealType, SavedMeal, secureSettingsStorage, useStore,
} from '../store/useStore';

type Mode = 'library' | 'manual' | 'photo';

/** Library section: sticky title + keyed rows (keys must be unique across
 *  sections — a favourited food also appears under "All foods"). A row is
 *  either a single food or a saved meal bundle ("meal-" keys). */
type LibRow = { k: string; f: FoodItem } | { k: string; m: SavedMeal };
type FoodSection = { title: string; data: LibRow[] };

const CATEGORY_KEYS = Object.keys(FOOD_CATEGORY_LABELS) as FoodCategory[];

let entrySeq = 0;
function entryId(): string {
  entrySeq += 1;
  return `food-${Date.now()}-${entrySeq}`;
}

/**
 * Food logging flow: pick from the built-in library, type a manual entry, or
 * snap a photo and let the AI itemise the plate. Lands entries on the day +
 * meal passed via route params.
 */
export default function AddFoodScreen({ navigation, route }: any) {
  const date: string = route.params?.date;
  const [meal, setMeal] = useState<MealType>(route.params?.meal ?? 'snack');
  const [mode, setMode] = useState<Mode>('library');

  const addFoodEntries = useStore((s) => s.addFoodEntries);
  const setToast = useStore((s) => s.setToast);
  const foodLog = useStore((s) => s.foodLog);
  const favoriteFoods = useStore((s) => s.favoriteFoods);
  const toggleFavoriteFood = useStore((s) => s.toggleFavoriteFood);
  const customFoods = useStore((s) => s.customFoods);
  const addCustomFood = useStore((s) => s.addCustomFood);
  const savedMeals = useStore((s) => s.savedMeals);
  const removeSavedMeal = useStore((s) => s.removeSavedMeal);
  const fam = familyStyle('health');

  // ── Library state ─────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FoodCategory | 'all'>('all');
  const [picked, setPicked] = useState<FoodItem | null>(null);
  const [qty, setQty] = useState(1);

  const customItems = useMemo<FoodItem[]>(
    () => customFoods.map((f) => ({ ...f, category: 'custom' as const })),
    [customFoods],
  );

  // Natural-unit quantity editing: "6 pieces" steps per piece, "100 g" takes
  // a free grams/ml input, single servings keep the 0.5× multiplier.
  const parsed = useMemo(() => (picked ? parseServing(picked.serving) : null), [picked]);
  const [gramsDraft, setGramsDraft] = useState('');
  const effMult = useMemo(() => {
    if (!picked || !parsed) return 1;
    if (parsed.mode === 'weight') {
      const g = parseFloat(gramsDraft);
      return Number.isFinite(g) && g > 0 && parsed.baseWeight ? g / parsed.baseWeight : 0;
    }
    return qty;
  }, [picked, parsed, gramsDraft, qty]);

  const pickFood = (item: FoodItem) => {
    setPicked(item);
    setQty(1);
    const p = parseServing(item.serving);
    setGramsDraft(p.mode === 'weight' && p.baseWeight ? String(p.baseWeight) : '');
  };
  const categoryKeys = customItems.length
    ? CATEGORY_KEYS
    : CATEGORY_KEYS.filter((c) => c !== 'custom');

  const sections = useMemo<FoodSection[]>(() => {
    const results = searchFoods(query, category, customItems);
    const allData: LibRow[] = results.map((f) => ({ k: `all-${f.name}`, f }));

    // Saved meals sit above everything else; they carry no category, so a
    // category filter hides them, but a name search still finds them.
    const q = query.trim().toLowerCase();
    const mealMatches = category === 'all'
      ? savedMeals.filter((m) => !q || m.name.toLowerCase().includes(q))
      : [];
    const mealSection: FoodSection | null = mealMatches.length
      ? { title: 'My Meals', data: mealMatches.map((m) => ({ k: `meal-${m.id}`, m })) }
      : null;

    if (query.trim() || category !== 'all') {
      const out: FoodSection[] = mealSection ? [mealSection] : [];
      if (allData.length) out.push({ title: mealSection ? 'All foods' : '', data: allData });
      return out;
    }

    // Per-serving FoodItem reconstructed from a logged entry — lets manual/
    // photo foods (which live in neither the library nor My Foods) appear in
    // Favourites and Recents.
    const fromEntry = (e: (typeof foodLog)[number]): FoodItem => {
      const q = e.quantity || 1;
      return {
        name: e.name,
        category: 'custom',
        calories: Math.round(e.calories / q),
        serving: e.serving ?? 'serving',
        protein: Math.round((e.protein ?? 0) / q),
        carbs: Math.round((e.carbs ?? 0) / q),
        fat: Math.round((e.fat ?? 0) / q),
      };
    };
    const newestEntryNamed = (name: string) => {
      for (let i = foodLog.length - 1; i >= 0; i -= 1) {
        if (foodLog[i].name === name) return fromEntry(foodLog[i]);
      }
      return null;
    };

    // Default view pins favourites + recently logged above the full list.
    // Favourites resolve from the library/My Foods first, then from log
    // history — so hearting a one-off photo food still sticks.
    const favs = favoriteFoods
      .map((name) => results.find((f) => f.name === name) ?? newestEntryNamed(name))
      .filter((f): f is FoodItem => f !== null);
    const seen = new Set<string>(favs.map((f) => f.name));
    const recents: FoodItem[] = [];
    for (let i = foodLog.length - 1; i >= 0 && recents.length < 8; i -= 1) {
      const e = foodLog[i];
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      recents.push(fromEntry(e));
    }
    const out: FoodSection[] = mealSection ? [mealSection] : [];
    if (favs.length) out.push({ title: '★ Favourites', data: favs.map((f) => ({ k: `fav-${f.name}`, f })) });
    if (recents.length) out.push({ title: 'Recent', data: recents.map((f) => ({ k: `rec-${f.name}`, f })) });
    out.push({ title: out.length ? 'All foods' : '', data: allData });
    return out;
  }, [query, category, customItems, favoriteFoods, foodLog, savedMeals]);

  // ── Manual state ──────────────────────────────────────────────────────
  const [mName, setMName] = useState('');
  const [mKcal, setMKcal] = useState('');
  const [mProtein, setMProtein] = useState('');
  const [mCarbs, setMCarbs] = useState('');
  const [mFat, setMFat] = useState('');
  const [mServing, setMServing] = useState('');
  const [saveToMyFoods, setSaveToMyFoods] = useState(false);

  // ── Photo state ───────────────────────────────────────────────────────
  const [analyzing, setAnalyzing] = useState(false);
  const [aiItems, setAiItems] = useState<FoodAnalysisItem[] | null>(null);
  const [aiNote, setAiNote] = useState<string | undefined>(undefined);
  const [aiSelected, setAiSelected] = useState<Set<number>>(new Set());

  const finish = (entries: FoodLogEntry[], label: string) => {
    addFoodEntries(entries);
    setToast({
      title: 'Logged',
      message: `${label} → ${MEAL_LABELS[meal]}, ${entries.reduce((s, e) => s + e.calories, 0)} kcal.`,
      type: 'success',
    });
    navigation.goBack();
  };

  const addLibraryItem = () => {
    if (!picked || !parsed) return;
    const mult = effMult;
    if (!(mult > 0)) {
      setToast({ title: 'Invalid amount', message: 'Enter a weight above zero.', type: 'error' });
      return;
    }
    // Pieces/weight entries log the ACTUAL portion as the serving string
    // (quantity 1), so the log reads "4 pieces · 180 kcal" rather than
    // "0.67 × 6 pieces".
    let serving = picked.serving;
    let quantity = qty;
    if (parsed.mode === 'weight') {
      serving = `${Math.round(parseFloat(gramsDraft))} ${parsed.weightUnit}`;
      quantity = 1;
    } else if (parsed.mode === 'pieces') {
      const pieces = Math.round(qty * parsed.count);
      serving = `${pieces} ${unitLabel(pieces, parsed.unit)}`;
      quantity = 1;
    }
    finish([{
      id: entryId(),
      date,
      meal,
      name: picked.name,
      calories: Math.round(picked.calories * mult),
      protein: Math.round(picked.protein * mult),
      carbs: Math.round(picked.carbs * mult),
      fat: Math.round(picked.fat * mult),
      quantity,
      serving,
      source: 'library',
      loggedAt: new Date().toISOString(),
    }], picked.name);
    setPicked(null);
  };

  const addManual = () => {
    const kcal = parseInt(mKcal, 10);
    if (!mName.trim() || !Number.isFinite(kcal) || kcal <= 0) {
      setToast({ title: 'Missing details', message: 'A name and calories are required.', type: 'error' });
      return;
    }
    const num = (s: string) => {
      const v = parseFloat(s);
      return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
    };
    if (saveToMyFoods) {
      addCustomFood({
        name: mName.trim(),
        calories: kcal,
        serving: mServing.trim() || '1 serving',
        protein: num(mProtein) ?? 0,
        carbs: num(mCarbs) ?? 0,
        fat: num(mFat) ?? 0,
      });
    }
    finish([{
      id: entryId(),
      date,
      meal,
      name: mName.trim(),
      calories: kcal,
      protein: num(mProtein),
      carbs: num(mCarbs),
      fat: num(mFat),
      quantity: 1,
      serving: mServing.trim() || undefined,
      source: 'manual',
      loggedAt: new Date().toISOString(),
    }], mName.trim());
  };

  const analyzePhoto = async (fromCamera: boolean) => {
    // expo-image-picker is a native module added after binary v21 — on older
    // builds the JS loads but native calls throw, so the whole flow is fenced.
    let picker: any;
    try {
      picker = require('expo-image-picker');
    } catch {
      setToast({ title: 'Update needed', message: 'Photo logging needs the latest app build.', type: 'error' });
      return;
    }
    try {
      const perm = fromCamera
        ? await picker.requestCameraPermissionsAsync()
        : await picker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setToast({ title: 'Permission needed', message: fromCamera ? 'Allow camera access to snap meals.' : 'Allow photo access to pick meals.', type: 'error' });
        return;
      }
      const res = fromCamera
        ? await picker.launchCameraAsync({ base64: true, quality: 0.5 })
        : await picker.launchImageLibraryAsync({ base64: true, quality: 0.5 });
      if (res.canceled || !res.assets?.[0]?.base64) return;

      const { settings } = useStore.getState();
      const apiKey = settings.llmApiKey || (await secureSettingsStorage.getSecret('llmApiKey')) || '';
      if (!apiKey) {
        setToast({ title: 'No API key', message: 'Add your LLM API key in Settings to analyse photos.', type: 'error' });
        return;
      }

      setAnalyzing(true);
      setAiItems(null);
      const analysis = await AIService.analyzeFoodPhoto(
        res.assets[0].base64,
        res.assets[0].mimeType || 'image/jpeg',
        settings.llmProvider,
        apiKey,
      );
      if (!analysis.items.length) {
        setToast({ title: 'No food found', message: analysis.note || 'Could not identify food in that photo.', type: 'info' });
        return;
      }
      setAiItems(analysis.items);
      setAiNote(analysis.note);
      setAiSelected(new Set(analysis.items.map((_, i) => i)));
    } catch (e: any) {
      console.error('[FoodPhoto]', e);
      const msg = String(e?.message || 'Photo analysis failed.').slice(0, 160);
      setToast({ title: 'Analysis failed', message: msg, type: 'error' });
    } finally {
      setAnalyzing(false);
    }
  };

  const addAiItems = () => {
    if (!aiItems) return;
    const chosen = aiItems.filter((_, i) => aiSelected.has(i));
    if (!chosen.length) return;
    finish(
      chosen.map((i) => ({
        id: entryId(),
        date,
        meal,
        name: i.name,
        calories: i.calories,
        protein: i.protein,
        carbs: i.carbs,
        fat: i.fat,
        quantity: 1,
        serving: i.serving,
        source: 'photo' as const,
        loggedAt: new Date().toISOString(),
      })),
      chosen.length === 1 ? chosen[0].name : `${chosen.length} items`,
    );
  };

  // One-tap bundle log: every saved item lands as its own entry, exactly as
  // it was when saved (serving/quantity/macros preserved).
  const logSavedMeal = (m: SavedMeal) => {
    const now = new Date().toISOString();
    finish(
      m.items.map((it) => ({
        id: entryId(),
        date,
        meal,
        name: it.name,
        calories: it.calories,
        protein: it.protein,
        carbs: it.carbs,
        fat: it.fat,
        quantity: it.quantity,
        serving: it.serving,
        source: 'library' as const,
        loggedAt: now,
      })),
      m.name,
    );
  };

  const [mealToDelete, setMealToDelete] = useState<SavedMeal | null>(null);

  const renderSavedMeal = (m: SavedMeal) => {
    const kcal = Math.round(m.items.reduce((s, it) => s + it.calories, 0));
    return (
      <PressableScale
        onPress={() => logSavedMeal(m)}
        style={styles.foodRow}
        accessibilityRole="button"
        accessibilityLabel={`Log ${m.name}`}
      >
        <View style={styles.foodBody}>
          <Typography style={styles.foodName} numberOfLines={1}>{m.name}</Typography>
          <Typography style={styles.foodSub}>
            {m.items.length} item{m.items.length === 1 ? '' : 's'} · saved meal
          </Typography>
        </View>
        <Typography style={[styles.foodKcal, { color: fam.accent }]}>{kcal} kcal</Typography>
        <Plus size={16} color={fam.accent} />
        <PressableScale
          onPress={() => setMealToDelete(m)}
          hitSlop={theme.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${m.name} from My Meals`}
        >
          <Trash2 size={16} color={theme.colors.textSecondary} />
        </PressableScale>
      </PressableScale>
    );
  };

  const renderFood = (item: FoodItem) => {
    const fav = favoriteFoods.includes(item.name);
    return (
      <PressableScale
        onPress={() => pickFood(item)}
        style={styles.foodRow}
        accessibilityRole="button"
        accessibilityLabel={`Add ${item.name}`}
      >
        <View style={styles.foodBody}>
          <Typography style={styles.foodName} numberOfLines={1}>{item.name}</Typography>
          <Typography style={styles.foodSub}>{item.serving} · P {item.protein} C {item.carbs} F {item.fat}</Typography>
        </View>
        <Typography style={[styles.foodKcal, { color: fam.accent }]}>{item.calories} kcal</Typography>
        <Plus size={16} color={fam.accent} />
        <PressableScale
          onPress={() => toggleFavoriteFood(item.name)}
          hitSlop={theme.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={fav ? `Remove ${item.name} from favourites` : `Add ${item.name} to favourites`}
        >
          <Heart
            size={16}
            color={fav ? fam.accent : theme.colors.textSecondary}
            fill={fav ? fam.accent : 'transparent'}
          />
        </PressableScale>
      </PressableScale>
    );
  };

  const libraryHeader = (
    <View style={styles.libHeader}>
      <View style={styles.searchBox}>
        <Search size={16} color={theme.colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search foods…"
          placeholderTextColor={theme.colors.textSecondary}
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
        {(['all', ...categoryKeys] as ('all' | FoodCategory)[]).map((c) => {
          const active = category === c;
          return (
            <PressableScale
              key={c}
              onPress={() => setCategory(c)}
              style={[
                styles.catChip,
                active && { backgroundColor: withAlpha(fam.accent, 'tint'), borderColor: withAlpha(fam.accent, 'strong') },
              ]}
            >
              <Typography style={[styles.catTxt, active && { color: fam.accent }]}>
                {c === 'all' ? 'All' : FOOD_CATEGORY_LABELS[c]}
              </Typography>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <PressableScale onPress={() => navigation.goBack()} hitSlop={theme.hitSlop} accessibilityRole="button" accessibilityLabel="Back">
          <ChevronLeft size={24} color={theme.colors.text} />
        </PressableScale>
        <Typography style={styles.headerTitle}>Add Food</Typography>
        <View style={{ width: 24 }} />
      </View>

      {/* Meal selector */}
      <View style={styles.mealRow}>
        {MEAL_ORDER.map((m) => {
          const active = meal === m;
          return (
            <PressableScale
              key={m}
              onPress={() => setMeal(m)}
              style={[
                styles.mealChip,
                active && { backgroundColor: withAlpha(fam.accent, 'tint'), borderColor: withAlpha(fam.accent, 'strong') },
              ]}
            >
              <Typography style={[styles.mealChipTxt, active && { color: fam.accent }]}>
                {MEAL_LABELS[m]}
              </Typography>
            </PressableScale>
          );
        })}
      </View>

      <View style={styles.segmentWrap}>
        <SegmentedControl
          segments={[
            { value: 'library', label: 'Library' },
            { value: 'manual', label: 'Manual' },
            { value: 'photo', label: 'Photo AI' },
          ]}
          value={mode}
          onChange={(v: Mode) => setMode(v)}
          family="health"
        />
      </View>

      {mode === 'library' && (
        <>
          {/* Search + categories live OUTSIDE the list so they never scroll
              away; the section titles stick under them as the list moves. */}
          {libraryHeader}
          <SectionList
            sections={sections}
            keyExtractor={(row) => row.k}
            renderItem={({ item: row }) => ('m' in row ? renderSavedMeal(row.m) : renderFood(row.f))}
            renderSectionHeader={({ section }) =>
              section.title ? (
                <View style={styles.stickyHeader}>
                  <Typography style={styles.sectionLabel}>{section.title}</Typography>
                </View>
              ) : null
            }
            stickySectionHeadersEnabled
            ListEmptyComponent={
              <Typography style={styles.emptyTxt}>
                Nothing matches “{query}” — try Manual entry.
              </Typography>
            }
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={14}
          />
        </>
      )}

      {mode === 'manual' && (
        <ScrollView contentContainerStyle={styles.manualContent} keyboardShouldPersistTaps="handled">
          <FieldBlock label="Food name" family="health" value={mName} onChangeText={setMName} placeholder="Masala oats" />
          <FieldBlock label="Calories (kcal)" family="health" value={mKcal} onChangeText={setMKcal} keyboardType="number-pad" numeric placeholder="250" />
          <View style={styles.macroInputs}>
            <View style={styles.macroInput}>
              <FieldBlock label="Protein g" family="health" value={mProtein} onChangeText={setMProtein} keyboardType="number-pad" numeric placeholder="–" />
            </View>
            <View style={styles.macroInput}>
              <FieldBlock label="Carbs g" family="health" value={mCarbs} onChangeText={setMCarbs} keyboardType="number-pad" numeric placeholder="–" />
            </View>
            <View style={styles.macroInput}>
              <FieldBlock label="Fat g" family="health" value={mFat} onChangeText={setMFat} keyboardType="number-pad" numeric placeholder="–" />
            </View>
          </View>
          <FieldBlock label="Serving (optional)" family="health" value={mServing} onChangeText={setMServing} placeholder="1 bowl" />
          <View style={styles.saveRow}>
            <Typography style={styles.saveRowTxt}>Save to My Foods</Typography>
            <Toggle
              value={saveToMyFoods}
              onValueChange={setSaveToMyFoods}
              accent={fam.accent}
              accessibilityLabel="Save to My Foods"
            />
          </View>
          <Button title="Add to log" family="health" fullWidth icon={Plus} onPress={addManual} />
        </ScrollView>
      )}

      {mode === 'photo' && (
        <ScrollView contentContainerStyle={styles.photoContent}>
          {analyzing ? (
            <View style={styles.analyzing}>
              <Pulsing maxScale={1.15} duration={900}>
                <View style={[styles.analyzeIcon, { backgroundColor: withAlpha(fam.accent, 'tint') }]}>
                  <Sparkles size={26} color={fam.accent} />
                </View>
              </Pulsing>
              <Typography style={styles.analyzeTitle}>Reading your plate…</Typography>
              <Typography style={styles.analyzeSub}>Identifying items and estimating portions</Typography>
            </View>
          ) : aiItems ? (
            <>
              <Typography style={styles.aiHint}>
                Tap to deselect anything that's wrong, then add the rest.
              </Typography>
              {aiItems.map((item, i) => {
                const on = aiSelected.has(i);
                return (
                  <PressableScale
                    key={`${item.name}-${i}`}
                    onPress={() => {
                      const next = new Set(aiSelected);
                      if (on) next.delete(i); else next.add(i);
                      setAiSelected(next);
                    }}
                    style={[
                      styles.aiRow,
                      on && { borderColor: withAlpha(fam.accent, 'strong'), backgroundColor: withAlpha(fam.accent, 'tint') },
                    ]}
                  >
                    <View style={[styles.aiCheck, on && { backgroundColor: fam.accent, borderColor: fam.accent }]}>
                      {on && <Check size={12} color={theme.colors.onAccent} />}
                    </View>
                    <View style={styles.foodBody}>
                      <Typography style={styles.foodName} numberOfLines={1}>{item.name}</Typography>
                      <Typography style={styles.foodSub}>
                        {item.serving || 'portion'}
                        {item.protein != null ? ` · P ${item.protein} C ${item.carbs ?? 0} F ${item.fat ?? 0}` : ''}
                      </Typography>
                    </View>
                    <Typography style={[styles.foodKcal, { color: fam.accent }]}>{item.calories} kcal</Typography>
                  </PressableScale>
                );
              })}
              {aiNote ? <Typography style={styles.aiNote}>{aiNote}</Typography> : null}
              <Button
                title={`Add ${aiSelected.size} item${aiSelected.size === 1 ? '' : 's'}`}
                family="health"
                fullWidth
                icon={Plus}
                disabled={aiSelected.size === 0}
                onPress={addAiItems}
              />
              <Button title="Retake photo" variant="ghost" family="health" fullWidth onPress={() => setAiItems(null)} />
            </>
          ) : (
            <>
              <View style={[styles.photoHero, { borderColor: withAlpha(fam.accent, 'strong') }]}>
                <Sparkles size={22} color={fam.accent} />
                <Typography style={styles.photoHeroTitle}>Snap your meal</Typography>
                <Typography style={styles.photoHeroSub}>
                  The AI identifies each item on the plate and estimates calories and macros for the portion shown.
                </Typography>
              </View>
              <Button title="Take photo" family="health" fullWidth icon={Camera} onPress={() => analyzePhoto(true)} />
              <Button title="Choose from library" variant="secondary" family="health" fullWidth icon={ImageIcon} onPress={() => analyzePhoto(false)} />
            </>
          )}
        </ScrollView>
      )}

      {/* Quantity sheet for library picks */}
      <Sheet
        visible={!!picked}
        onClose={() => setPicked(null)}
        title={picked?.name}
        caption={picked ? `${picked.calories} kcal per ${picked.serving}` : undefined}
      >
        {picked && parsed && (() => {
          const pieces = Math.round(qty * parsed.count);
          const setPieces = (n: number) =>
            setQty(Math.max(1, Math.min(99, n)) / parsed.count);
          // e.g. 6-piece base → 1 / 3 / 6 / 9 / 12 quick picks.
          const pieceChips = Array.from(
            new Set([1, ...[0.5, 1, 1.5, 2].map((m) => Math.round(parsed.count * m))]),
          ).filter((n) => n >= 1).sort((a, b) => a - b).slice(0, 5);
          const weightChips = parsed.baseWeight
            ? Array.from(new Set([0.5, 1, 1.5, 2].map((m) => Math.round(parsed.baseWeight! * m))))
            : [];
          const grams = parseFloat(gramsDraft);
          const stepGrams = (d: number) =>
            setGramsDraft(String(Math.max(5, Math.min(2000, (Number.isFinite(grams) ? grams : parsed.baseWeight ?? 0) + d))));

          return (
            <View style={styles.qtyBody}>
              {parsed.mode === 'pieces' && (
                <>
                  <View style={styles.qtyRow}>
                    <PressableScale
                      onPress={() => setPieces(pieces - 1)}
                      style={[styles.qtyBtn, { backgroundColor: withAlpha(fam.accent, 'tint') }]}
                      accessibilityLabel={`Decrease to ${pieces - 1}`}
                    >
                      <Minus size={18} color={fam.accent} />
                    </PressableScale>
                    <View style={styles.qtyMid}>
                      <Typography style={styles.qtyVal}>{pieces}</Typography>
                      <Typography style={styles.qtyUnit}>{unitLabel(pieces, parsed.unit)}</Typography>
                    </View>
                    <PressableScale
                      onPress={() => setPieces(pieces + 1)}
                      style={[styles.qtyBtn, { backgroundColor: withAlpha(fam.accent, 'tint') }]}
                      accessibilityLabel={`Increase to ${pieces + 1}`}
                    >
                      <Plus size={18} color={fam.accent} />
                    </PressableScale>
                  </View>
                  <View style={styles.qtyQuickRow}>
                    {pieceChips.map((n) => {
                      const active = pieces === n;
                      return (
                        <PressableScale
                          key={n}
                          onPress={() => setPieces(n)}
                          style={[
                            styles.qtyQuick,
                            active && { backgroundColor: withAlpha(fam.accent, 'tint'), borderColor: withAlpha(fam.accent, 'strong') },
                          ]}
                        >
                          <Typography style={[styles.qtyQuickTxt, active && { color: fam.accent }]}>
                            {n}
                          </Typography>
                        </PressableScale>
                      );
                    })}
                  </View>
                </>
              )}

              {parsed.mode === 'weight' && (
                <>
                  <View style={styles.qtyRow}>
                    <PressableScale
                      onPress={() => stepGrams(-10)}
                      style={[styles.qtyBtn, { backgroundColor: withAlpha(fam.accent, 'tint') }]}
                      accessibilityLabel={`Decrease by 10 ${parsed.weightUnit}`}
                    >
                      <Minus size={18} color={fam.accent} />
                    </PressableScale>
                    <View style={styles.qtyMid}>
                      <View style={styles.weightInputRow}>
                        <TextInput
                          value={gramsDraft}
                          onChangeText={setGramsDraft}
                          keyboardType="numeric"
                          style={styles.weightInput}
                          selectTextOnFocus
                          accessibilityLabel={`Amount in ${parsed.weightUnit}`}
                        />
                        <Typography style={styles.qtyUnit}>{parsed.weightUnit}</Typography>
                      </View>
                    </View>
                    <PressableScale
                      onPress={() => stepGrams(10)}
                      style={[styles.qtyBtn, { backgroundColor: withAlpha(fam.accent, 'tint') }]}
                      accessibilityLabel={`Increase by 10 ${parsed.weightUnit}`}
                    >
                      <Plus size={18} color={fam.accent} />
                    </PressableScale>
                  </View>
                  <View style={styles.qtyQuickRow}>
                    {weightChips.map((g) => {
                      const active = grams === g;
                      return (
                        <PressableScale
                          key={g}
                          onPress={() => setGramsDraft(String(g))}
                          style={[
                            styles.qtyQuick,
                            active && { backgroundColor: withAlpha(fam.accent, 'tint'), borderColor: withAlpha(fam.accent, 'strong') },
                          ]}
                        >
                          <Typography style={[styles.qtyQuickTxt, active && { color: fam.accent }]}>
                            {g} {parsed.weightUnit}
                          </Typography>
                        </PressableScale>
                      );
                    })}
                  </View>
                </>
              )}

              {parsed.mode === 'servings' && (
                <>
                  <View style={styles.qtyRow}>
                    <PressableScale
                      onPress={() => setQty((q) => Math.max(0.5, Math.round((q - 0.5) * 2) / 2))}
                      style={[styles.qtyBtn, { backgroundColor: withAlpha(fam.accent, 'tint') }]}
                      accessibilityLabel="Decrease quantity"
                    >
                      <Minus size={18} color={fam.accent} />
                    </PressableScale>
                    <View style={styles.qtyMid}>
                      <Typography style={styles.qtyVal}>{qty}</Typography>
                      <Typography style={styles.qtyUnit}>× {picked.serving}</Typography>
                    </View>
                    <PressableScale
                      onPress={() => setQty((q) => Math.min(20, Math.round((q + 0.5) * 2) / 2))}
                      style={[styles.qtyBtn, { backgroundColor: withAlpha(fam.accent, 'tint') }]}
                      accessibilityLabel="Increase quantity"
                    >
                      <Plus size={18} color={fam.accent} />
                    </PressableScale>
                  </View>
                  <View style={styles.qtyQuickRow}>
                    {[0.5, 1, 1.5, 2, 3].map((q) => {
                      const active = qty === q;
                      return (
                        <PressableScale
                          key={q}
                          onPress={() => setQty(q)}
                          style={[
                            styles.qtyQuick,
                            active && { backgroundColor: withAlpha(fam.accent, 'tint'), borderColor: withAlpha(fam.accent, 'strong') },
                          ]}
                        >
                          <Typography style={[styles.qtyQuickTxt, active && { color: fam.accent }]}>
                            {q}×
                          </Typography>
                        </PressableScale>
                      );
                    })}
                  </View>
                </>
              )}

              <Typography style={styles.qtyMacros}>
                P {Math.round(picked.protein * effMult)} g · C {Math.round(picked.carbs * effMult)} g · F {Math.round(picked.fat * effMult)} g
              </Typography>
              <Button
                title={effMult > 0 ? `Add · ${Math.round(picked.calories * effMult)} kcal` : 'Enter an amount'}
                family="health"
                fullWidth
                disabled={!(effMult > 0)}
                onPress={addLibraryItem}
              />
            </View>
          );
        })()}
      </Sheet>

      {/* ── Delete saved meal confirm ── */}
      <Sheet
        visible={!!mealToDelete}
        onClose={() => setMealToDelete(null)}
        title="Delete saved meal?"
        caption={mealToDelete ? `“${mealToDelete.name}” will be removed from My Meals.` : undefined}
      >
        <Button
          title="Delete"
          variant="destructive"
          icon={Trash2}
          fullWidth
          onPress={() => {
            if (mealToDelete) removeSavedMeal(mealToDelete.id);
            setMealToDelete(null);
          }}
        />
        <View style={{ height: 10 }} />
        <Button
          title="Cancel"
          variant="ghost"
          fullWidth
          onPress={() => setMealToDelete(null)}
        />
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitle: {
    ...theme.typography.heading,
    color: theme.colors.text,
  },
  mealRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  mealChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  mealChipTxt: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  segmentWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  libHeader: {
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    paddingVertical: 10,
    ...theme.typography.footnote,
  },
  catRow: {
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  catTxt: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 130,
  },
  // Solid background so list rows vanish cleanly behind the pinned title.
  stickyHeader: {
    backgroundColor: theme.colors.background,
    paddingTop: 10,
    paddingBottom: 5,
  },
  sectionLabel: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
  },
  foodBody: {
    flex: 1,
  },
  foodName: {
    ...theme.typography.footnote,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
  },
  foodSub: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  foodKcal: {
    ...theme.typography.footnote,
  },
  emptyTxt: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 30,
  },
  manualContent: {
    paddingHorizontal: 16,
    paddingBottom: 130,
    gap: 12,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  saveRowTxt: {
    ...theme.typography.footnote,
    color: theme.colors.text,
  },
  macroInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  macroInput: {
    flex: 1,
  },
  photoContent: {
    paddingHorizontal: 16,
    paddingBottom: 130,
    gap: 12,
  },
  photoHero: {
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 26,
    backgroundColor: theme.colors.surface,
  },
  photoHeroTitle: {
    ...theme.typography.subtitle,
    color: theme.colors.text,
  },
  photoHeroSub: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  analyzing: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 50,
  },
  analyzeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzeTitle: {
    ...theme.typography.subtitle,
    color: theme.colors.text,
  },
  analyzeSub: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
  },
  aiHint: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
  },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  aiCheck: {
    width: 20,
    height: 20,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiNote: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  qtyBody: {
    gap: 16,
    paddingVertical: 8,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
  },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyMid: {
    alignItems: 'center',
    minWidth: 110,
  },
  qtyVal: {
    ...theme.typography.title,
    color: theme.colors.text,
  },
  qtyUnit: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  qtyQuickRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  qtyQuick: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  qtyQuickTxt: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  qtyMacros: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  weightInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
  },
  weightInput: {
    ...theme.typography.title,
    color: theme.colors.text,
    minWidth: 64,
    textAlign: 'center',
    paddingVertical: 0,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
});
