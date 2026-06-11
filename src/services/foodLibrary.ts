// ── Built-in food database ───────────────────────────────────────────────────
//
// Curated nutrition reference the athlete can log from without typing macros.
// Values are per the stated serving (USDA / IFCT averages, rounded). The list
// deliberately mixes whole foods with common cooked dishes (incl. Indian
// staples) so day-to-day logging rarely needs manual entry.

export type FoodCategory =
  | 'fruits'
  | 'vegetables'
  | 'grains'
  | 'protein'
  | 'dairy'
  | 'meals'
  | 'snacks'
  | 'drinks'
  | 'fastfood';

export interface FoodItem {
  name: string;
  category: FoodCategory;
  /** kcal per serving. */
  calories: number;
  /** Human serving descriptor the calories refer to. */
  serving: string;
  /** Macros in grams per serving. */
  protein: number;
  carbs: number;
  fat: number;
}

export const FOOD_CATEGORY_LABELS: Record<FoodCategory, string> = {
  fruits: 'Fruits',
  vegetables: 'Vegetables',
  grains: 'Grains & Breads',
  protein: 'Protein',
  dairy: 'Dairy',
  meals: 'Meals & Dishes',
  snacks: 'Snacks & Sweets',
  drinks: 'Drinks',
  fastfood: 'Fast Food',
};

export const FOOD_LIBRARY: FoodItem[] = [
  // ── Fruits ──────────────────────────────────────────────────────────────
  { name: 'Apple', category: 'fruits', calories: 95, serving: '1 medium', protein: 0.5, carbs: 25, fat: 0.3 },
  { name: 'Banana', category: 'fruits', calories: 105, serving: '1 medium', protein: 1.3, carbs: 27, fat: 0.4 },
  { name: 'Orange', category: 'fruits', calories: 62, serving: '1 medium', protein: 1.2, carbs: 15, fat: 0.2 },
  { name: 'Mango', category: 'fruits', calories: 200, serving: '1 whole', protein: 2.8, carbs: 50, fat: 1.3 },
  { name: 'Grapes', category: 'fruits', calories: 104, serving: '1 cup', protein: 1.1, carbs: 27, fat: 0.2 },
  { name: 'Watermelon', category: 'fruits', calories: 46, serving: '1 cup cubes', protein: 0.9, carbs: 12, fat: 0.2 },
  { name: 'Papaya', category: 'fruits', calories: 62, serving: '1 cup cubes', protein: 0.7, carbs: 16, fat: 0.4 },
  { name: 'Pomegranate', category: 'fruits', calories: 144, serving: '1 cup arils', protein: 2.9, carbs: 33, fat: 2 },
  { name: 'Strawberries', category: 'fruits', calories: 49, serving: '1 cup', protein: 1, carbs: 12, fat: 0.5 },
  { name: 'Blueberries', category: 'fruits', calories: 84, serving: '1 cup', protein: 1.1, carbs: 21, fat: 0.5 },
  { name: 'Pineapple', category: 'fruits', calories: 82, serving: '1 cup chunks', protein: 0.9, carbs: 22, fat: 0.2 },
  { name: 'Kiwi', category: 'fruits', calories: 42, serving: '1 fruit', protein: 0.8, carbs: 10, fat: 0.4 },
  { name: 'Pear', category: 'fruits', calories: 101, serving: '1 medium', protein: 0.6, carbs: 27, fat: 0.2 },
  { name: 'Guava', category: 'fruits', calories: 37, serving: '1 fruit', protein: 1.4, carbs: 8, fat: 0.5 },
  { name: 'Chikoo (Sapota)', category: 'fruits', calories: 80, serving: '1 fruit', protein: 0.4, carbs: 20, fat: 1.1 },
  { name: 'Dates', category: 'fruits', calories: 66, serving: '1 date (Medjool)', protein: 0.4, carbs: 18, fat: 0 },
  { name: 'Avocado', category: 'fruits', calories: 240, serving: '1 whole', protein: 3, carbs: 13, fat: 22 },
  { name: 'Coconut (fresh)', category: 'fruits', calories: 99, serving: '1 piece (28 g)', protein: 0.9, carbs: 4.3, fat: 9.4 },

  // ── Vegetables ──────────────────────────────────────────────────────────
  { name: 'Broccoli (steamed)', category: 'vegetables', calories: 55, serving: '1 cup', protein: 3.7, carbs: 11, fat: 0.6 },
  { name: 'Spinach (cooked)', category: 'vegetables', calories: 41, serving: '1 cup', protein: 5.3, carbs: 6.8, fat: 0.5 },
  { name: 'Carrot', category: 'vegetables', calories: 25, serving: '1 medium', protein: 0.6, carbs: 6, fat: 0.1 },
  { name: 'Cucumber', category: 'vegetables', calories: 16, serving: '1 cup sliced', protein: 0.7, carbs: 4, fat: 0.1 },
  { name: 'Tomato', category: 'vegetables', calories: 22, serving: '1 medium', protein: 1.1, carbs: 4.8, fat: 0.2 },
  { name: 'Sweet Potato (baked)', category: 'vegetables', calories: 103, serving: '1 medium', protein: 2.3, carbs: 24, fat: 0.2 },
  { name: 'Potato (boiled)', category: 'vegetables', calories: 87, serving: '1 medium', protein: 1.9, carbs: 20, fat: 0.1 },
  { name: 'Cauliflower (cooked)', category: 'vegetables', calories: 29, serving: '1 cup', protein: 2.3, carbs: 5, fat: 0.6 },
  { name: 'Green Peas', category: 'vegetables', calories: 134, serving: '1 cup', protein: 8.6, carbs: 25, fat: 0.4 },
  { name: 'Bell Pepper', category: 'vegetables', calories: 31, serving: '1 medium', protein: 1, carbs: 7, fat: 0.3 },
  { name: 'Onion', category: 'vegetables', calories: 44, serving: '1 medium', protein: 1.2, carbs: 10, fat: 0.1 },
  { name: 'Beetroot (cooked)', category: 'vegetables', calories: 75, serving: '1 cup', protein: 2.9, carbs: 17, fat: 0.3 },
  { name: 'Mushrooms (sautéed)', category: 'vegetables', calories: 44, serving: '1 cup', protein: 3.4, carbs: 6.4, fat: 0.7 },
  { name: 'Mixed Salad (no dressing)', category: 'vegetables', calories: 33, serving: '2 cups', protein: 2, carbs: 6.5, fat: 0.4 },
  { name: 'Corn (boiled)', category: 'vegetables', calories: 96, serving: '1 ear', protein: 3.4, carbs: 21, fat: 1.5 },
  { name: 'Bhindi Sabzi (okra)', category: 'vegetables', calories: 150, serving: '1 katori', protein: 3, carbs: 12, fat: 10 },
  { name: 'Aloo Gobi', category: 'vegetables', calories: 180, serving: '1 katori', protein: 4, carbs: 22, fat: 9 },
  { name: 'Baingan Bharta', category: 'vegetables', calories: 165, serving: '1 katori', protein: 3.5, carbs: 14, fat: 11 },

  // ── Grains & breads ─────────────────────────────────────────────────────
  { name: 'White Rice (cooked)', category: 'grains', calories: 205, serving: '1 cup', protein: 4.3, carbs: 45, fat: 0.4 },
  { name: 'Brown Rice (cooked)', category: 'grains', calories: 218, serving: '1 cup', protein: 4.5, carbs: 46, fat: 1.6 },
  { name: 'Chapati / Roti', category: 'grains', calories: 104, serving: '1 medium', protein: 3.5, carbs: 18, fat: 2.5 },
  { name: 'Paratha (plain)', category: 'grains', calories: 260, serving: '1 medium', protein: 5, carbs: 30, fat: 13 },
  { name: 'Aloo Paratha', category: 'grains', calories: 300, serving: '1 medium', protein: 6, carbs: 40, fat: 13 },
  { name: 'Naan', category: 'grains', calories: 262, serving: '1 piece', protein: 9, carbs: 45, fat: 5 },
  { name: 'White Bread', category: 'grains', calories: 75, serving: '1 slice', protein: 2.6, carbs: 14, fat: 1 },
  { name: 'Whole Wheat Bread', category: 'grains', calories: 81, serving: '1 slice', protein: 4, carbs: 14, fat: 1.1 },
  { name: 'Oats (cooked)', category: 'grains', calories: 166, serving: '1 cup', protein: 5.9, carbs: 28, fat: 3.6 },
  { name: 'Muesli', category: 'grains', calories: 289, serving: '⅔ cup', protein: 8, carbs: 66, fat: 4 },
  { name: 'Cornflakes + Milk', category: 'grains', calories: 220, serving: '1 bowl', protein: 8, carbs: 40, fat: 3.5 },
  { name: 'Pasta (cooked)', category: 'grains', calories: 220, serving: '1 cup', protein: 8, carbs: 43, fat: 1.3 },
  { name: 'Quinoa (cooked)', category: 'grains', calories: 222, serving: '1 cup', protein: 8.1, carbs: 39, fat: 3.6 },
  { name: 'Poha', category: 'grains', calories: 250, serving: '1 plate', protein: 5, carbs: 45, fat: 6 },
  { name: 'Upma', category: 'grains', calories: 230, serving: '1 katori', protein: 6, carbs: 36, fat: 7 },
  { name: 'Idli', category: 'grains', calories: 58, serving: '1 piece', protein: 2, carbs: 12, fat: 0.4 },
  { name: 'Dosa (plain)', category: 'grains', calories: 168, serving: '1 medium', protein: 4, carbs: 28, fat: 4 },
  { name: 'Masala Dosa', category: 'grains', calories: 387, serving: '1 dosa', protein: 7, carbs: 60, fat: 13 },
  { name: 'Uttapam', category: 'grains', calories: 210, serving: '1 piece', protein: 5, carbs: 35, fat: 5.5 },
  { name: 'Tortilla / Wrap', category: 'grains', calories: 140, serving: '1 (8 in)', protein: 4, carbs: 24, fat: 3.5 },

  // ── Protein ─────────────────────────────────────────────────────────────
  { name: 'Egg (boiled)', category: 'protein', calories: 78, serving: '1 large', protein: 6.3, carbs: 0.6, fat: 5.3 },
  { name: 'Egg Omelette (2 eggs)', category: 'protein', calories: 220, serving: '1 omelette', protein: 13, carbs: 2, fat: 17 },
  { name: 'Chicken Breast (grilled)', category: 'protein', calories: 165, serving: '100 g', protein: 31, carbs: 0, fat: 3.6 },
  { name: 'Chicken Curry', category: 'protein', calories: 280, serving: '1 katori', protein: 22, carbs: 8, fat: 17 },
  { name: 'Tandoori Chicken', category: 'protein', calories: 260, serving: '2 pieces', protein: 30, carbs: 5, fat: 13 },
  { name: 'Fish (grilled)', category: 'protein', calories: 180, serving: '150 g', protein: 30, carbs: 0, fat: 6 },
  { name: 'Fish Curry', category: 'protein', calories: 240, serving: '1 katori', protein: 20, carbs: 7, fat: 14 },
  { name: 'Prawns (sautéed)', category: 'protein', calories: 120, serving: '100 g', protein: 24, carbs: 0.2, fat: 1.7 },
  { name: 'Mutton Curry', category: 'protein', calories: 330, serving: '1 katori', protein: 24, carbs: 6, fat: 23 },
  { name: 'Paneer (raw)', category: 'protein', calories: 265, serving: '100 g', protein: 18, carbs: 1.2, fat: 21 },
  { name: 'Paneer Butter Masala', category: 'protein', calories: 350, serving: '1 katori', protein: 12, carbs: 12, fat: 28 },
  { name: 'Palak Paneer', category: 'protein', calories: 280, serving: '1 katori', protein: 13, carbs: 9, fat: 21 },
  { name: 'Tofu', category: 'protein', calories: 94, serving: '100 g', protein: 10, carbs: 2.3, fat: 5.9 },
  { name: 'Dal (cooked)', category: 'protein', calories: 150, serving: '1 katori', protein: 9, carbs: 22, fat: 3 },
  { name: 'Dal Makhani', category: 'protein', calories: 280, serving: '1 katori', protein: 11, carbs: 24, fat: 16 },
  { name: 'Chole (chickpea curry)', category: 'protein', calories: 240, serving: '1 katori', protein: 11, carbs: 32, fat: 8 },
  { name: 'Rajma (kidney bean curry)', category: 'protein', calories: 220, serving: '1 katori', protein: 11, carbs: 30, fat: 6 },
  { name: 'Sprouts Salad', category: 'protein', calories: 120, serving: '1 katori', protein: 8, carbs: 18, fat: 1.5 },
  { name: 'Whey Protein Shake', category: 'protein', calories: 130, serving: '1 scoop + water', protein: 25, carbs: 3, fat: 1.5 },
  { name: 'Peanut Butter', category: 'protein', calories: 94, serving: '1 tbsp', protein: 4, carbs: 3, fat: 8 },
  { name: 'Almonds', category: 'protein', calories: 164, serving: '23 nuts (28 g)', protein: 6, carbs: 6, fat: 14 },
  { name: 'Walnuts', category: 'protein', calories: 185, serving: '7 halves (28 g)', protein: 4.3, carbs: 3.9, fat: 18.5 },
  { name: 'Cashews', category: 'protein', calories: 157, serving: '18 nuts (28 g)', protein: 5.2, carbs: 8.6, fat: 12.4 },

  // ── Dairy ───────────────────────────────────────────────────────────────
  { name: 'Milk (whole)', category: 'dairy', calories: 149, serving: '1 cup', protein: 7.7, carbs: 12, fat: 8 },
  { name: 'Milk (toned/2%)', category: 'dairy', calories: 122, serving: '1 cup', protein: 8.1, carbs: 12, fat: 4.8 },
  { name: 'Curd / Dahi', category: 'dairy', calories: 98, serving: '1 katori', protein: 5.5, carbs: 7, fat: 5 },
  { name: 'Greek Yogurt (plain)', category: 'dairy', calories: 100, serving: '170 g', protein: 17, carbs: 6, fat: 0.7 },
  { name: 'Buttermilk / Chaas', category: 'dairy', calories: 40, serving: '1 glass', protein: 2.5, carbs: 4, fat: 1.5 },
  { name: 'Lassi (sweet)', category: 'dairy', calories: 180, serving: '1 glass', protein: 5, carbs: 27, fat: 6 },
  { name: 'Cheese (cheddar)', category: 'dairy', calories: 113, serving: '1 slice (28 g)', protein: 6.4, carbs: 0.9, fat: 9.3 },
  { name: 'Butter', category: 'dairy', calories: 102, serving: '1 tbsp', protein: 0.1, carbs: 0, fat: 11.5 },
  { name: 'Ghee', category: 'dairy', calories: 112, serving: '1 tbsp', protein: 0, carbs: 0, fat: 12.7 },

  // ── Meals & dishes ──────────────────────────────────────────────────────
  { name: 'Veg Biryani', category: 'meals', calories: 400, serving: '1 plate', protein: 9, carbs: 65, fat: 12 },
  { name: 'Chicken Biryani', category: 'meals', calories: 490, serving: '1 plate', protein: 25, carbs: 60, fat: 16 },
  { name: 'Dal + Rice', category: 'meals', calories: 355, serving: '1 plate', protein: 13, carbs: 67, fat: 3.5 },
  { name: 'Rajma Chawal', category: 'meals', calories: 425, serving: '1 plate', protein: 15, carbs: 75, fat: 6.5 },
  { name: 'Curd Rice', category: 'meals', calories: 305, serving: '1 plate', protein: 9, carbs: 52, fat: 7 },
  { name: 'Khichdi', category: 'meals', calories: 280, serving: '1 plate', protein: 10, carbs: 48, fat: 5 },
  { name: 'Pulao', category: 'meals', calories: 350, serving: '1 plate', protein: 7, carbs: 58, fat: 10 },
  { name: 'Pav Bhaji', category: 'meals', calories: 400, serving: '1 plate (2 pav)', protein: 9, carbs: 55, fat: 16 },
  { name: 'Chole Bhature', category: 'meals', calories: 650, serving: '1 plate', protein: 16, carbs: 80, fat: 29 },
  { name: 'Thali (veg, standard)', category: 'meals', calories: 700, serving: '1 thali', protein: 20, carbs: 100, fat: 24 },
  { name: 'Fried Rice (veg)', category: 'meals', calories: 380, serving: '1 plate', protein: 7, carbs: 60, fat: 12 },
  { name: 'Noodles (hakka)', category: 'meals', calories: 420, serving: '1 plate', protein: 9, carbs: 62, fat: 15 },
  { name: 'Chicken Caesar Salad', category: 'meals', calories: 390, serving: '1 bowl', protein: 30, carbs: 12, fat: 25 },
  { name: 'Grilled Sandwich (veg)', category: 'meals', calories: 290, serving: '1 sandwich', protein: 9, carbs: 38, fat: 11 },
  { name: 'Egg Bhurji + 2 Roti', category: 'meals', calories: 420, serving: '1 plate', protein: 19, carbs: 40, fat: 20 },
  { name: 'Soup (mixed veg)', category: 'meals', calories: 90, serving: '1 bowl', protein: 3, carbs: 14, fat: 2.5 },

  // ── Snacks & sweets ─────────────────────────────────────────────────────
  { name: 'Samosa', category: 'snacks', calories: 262, serving: '1 piece', protein: 4, carbs: 30, fat: 14 },
  { name: 'Vada Pav', category: 'snacks', calories: 290, serving: '1 piece', protein: 6, carbs: 40, fat: 12 },
  { name: 'Pakora (mixed)', category: 'snacks', calories: 180, serving: '4 pieces', protein: 4, carbs: 16, fat: 11 },
  { name: 'Dhokla', category: 'snacks', calories: 160, serving: '2 pieces', protein: 6, carbs: 24, fat: 4.5 },
  { name: 'Bhel Puri', category: 'snacks', calories: 230, serving: '1 plate', protein: 5, carbs: 38, fat: 7 },
  { name: 'Popcorn (plain)', category: 'snacks', calories: 93, serving: '3 cups', protein: 3, carbs: 19, fat: 1.1 },
  { name: 'Potato Chips', category: 'snacks', calories: 160, serving: '1 small pack (30 g)', protein: 2, carbs: 15, fat: 10 },
  { name: 'Dark Chocolate', category: 'snacks', calories: 170, serving: '4 squares (28 g)', protein: 2.2, carbs: 13, fat: 12 },
  { name: 'Milk Chocolate Bar', category: 'snacks', calories: 235, serving: '1 bar (44 g)', protein: 3.4, carbs: 26, fat: 13 },
  { name: 'Biscuits (Marie)', category: 'snacks', calories: 112, serving: '4 biscuits', protein: 1.6, carbs: 19, fat: 3.2 },
  { name: 'Cookies (chocolate chip)', category: 'snacks', calories: 160, serving: '2 cookies', protein: 1.8, carbs: 22, fat: 8 },
  { name: 'Granola Bar', category: 'snacks', calories: 120, serving: '1 bar', protein: 2.5, carbs: 20, fat: 4 },
  { name: 'Protein Bar', category: 'snacks', calories: 200, serving: '1 bar', protein: 20, carbs: 21, fat: 7 },
  { name: 'Gulab Jamun', category: 'snacks', calories: 150, serving: '1 piece', protein: 2, carbs: 23, fat: 6 },
  { name: 'Jalebi', category: 'snacks', calories: 150, serving: '1 piece (30 g)', protein: 1, carbs: 22, fat: 6.5 },
  { name: 'Kheer', category: 'snacks', calories: 215, serving: '1 katori', protein: 6, carbs: 32, fat: 7 },
  { name: 'Ice Cream (vanilla)', category: 'snacks', calories: 137, serving: '1 scoop', protein: 2.3, carbs: 16, fat: 7.3 },
  { name: 'Cake (chocolate slice)', category: 'snacks', calories: 350, serving: '1 slice', protein: 5, carbs: 50, fat: 15 },
  { name: 'Trail Mix', category: 'snacks', calories: 170, serving: '¼ cup', protein: 5, carbs: 13, fat: 12 },
  { name: 'Banana Chips', category: 'snacks', calories: 150, serving: '30 g', protein: 0.7, carbs: 17, fat: 9 },

  // ── Drinks ──────────────────────────────────────────────────────────────
  { name: 'Tea with Milk & Sugar', category: 'drinks', calories: 60, serving: '1 cup', protein: 1.5, carbs: 9, fat: 2 },
  { name: 'Black Coffee', category: 'drinks', calories: 2, serving: '1 cup', protein: 0.3, carbs: 0, fat: 0 },
  { name: 'Cappuccino', category: 'drinks', calories: 80, serving: '1 cup', protein: 4, carbs: 7, fat: 4 },
  { name: 'Cold Coffee (sweetened)', category: 'drinks', calories: 180, serving: '1 glass', protein: 5, carbs: 28, fat: 5.5 },
  { name: 'Orange Juice', category: 'drinks', calories: 112, serving: '1 cup', protein: 1.7, carbs: 26, fat: 0.5 },
  { name: 'Coconut Water', category: 'drinks', calories: 46, serving: '1 cup', protein: 1.7, carbs: 9, fat: 0.5 },
  { name: 'Soft Drink (cola)', category: 'drinks', calories: 140, serving: '1 can (330 ml)', protein: 0, carbs: 39, fat: 0 },
  { name: 'Sports Drink', category: 'drinks', calories: 80, serving: '1 bottle (350 ml)', protein: 0, carbs: 21, fat: 0 },
  { name: 'Beer', category: 'drinks', calories: 154, serving: '1 bottle (355 ml)', protein: 1.6, carbs: 13, fat: 0 },
  { name: 'Wine (red)', category: 'drinks', calories: 125, serving: '1 glass (150 ml)', protein: 0.1, carbs: 3.8, fat: 0 },
  { name: 'Smoothie (banana + milk)', category: 'drinks', calories: 220, serving: '1 glass', protein: 8, carbs: 40, fat: 4 },
  { name: 'Sugarcane Juice', category: 'drinks', calories: 180, serving: '1 glass', protein: 0, carbs: 45, fat: 0 },

  // ── Fast food ───────────────────────────────────────────────────────────
  { name: 'Margherita Pizza', category: 'fastfood', calories: 250, serving: '1 slice', protein: 10, carbs: 31, fat: 9 },
  { name: 'Chicken Burger', category: 'fastfood', calories: 450, serving: '1 burger', protein: 22, carbs: 42, fat: 21 },
  { name: 'Veg Burger', category: 'fastfood', calories: 390, serving: '1 burger', protein: 10, carbs: 50, fat: 16 },
  { name: 'French Fries', category: 'fastfood', calories: 320, serving: '1 medium', protein: 4, carbs: 43, fat: 15 },
  { name: 'Chicken Nuggets', category: 'fastfood', calories: 270, serving: '6 pieces', protein: 14, carbs: 16, fat: 17 },
  { name: 'Momos (veg, steamed)', category: 'fastfood', calories: 210, serving: '6 pieces', protein: 7, carbs: 36, fat: 4 },
  { name: 'Momos (chicken, steamed)', category: 'fastfood', calories: 250, serving: '6 pieces', protein: 14, carbs: 32, fat: 7 },
  { name: 'Spring Roll', category: 'fastfood', calories: 160, serving: '1 roll', protein: 3, carbs: 20, fat: 7.5 },
  { name: 'Shawarma (chicken)', category: 'fastfood', calories: 430, serving: '1 wrap', protein: 26, carbs: 42, fat: 17 },
  { name: 'Hot Dog', category: 'fastfood', calories: 290, serving: '1 piece', protein: 10, carbs: 24, fat: 17 },
  { name: 'Tacos (chicken)', category: 'fastfood', calories: 210, serving: '1 taco', protein: 12, carbs: 18, fat: 10 },
  { name: 'Sushi Roll (california)', category: 'fastfood', calories: 255, serving: '8 pieces', protein: 9, carbs: 38, fat: 7 },
];

/**
 * Case-insensitive library search; prefix matches rank above substring
 * matches so "pa" surfaces Paratha/Paneer before Chapati.
 */
export function searchFoods(query: string, category?: FoodCategory | 'all'): FoodItem[] {
  const pool = !category || category === 'all'
    ? FOOD_LIBRARY
    : FOOD_LIBRARY.filter((f) => f.category === category);
  const q = query.trim().toLowerCase();
  if (!q) return pool;
  const starts: FoodItem[] = [];
  const contains: FoodItem[] = [];
  for (const f of pool) {
    const name = f.name.toLowerCase();
    if (name.startsWith(q)) starts.push(f);
    else if (name.includes(q)) contains.push(f);
  }
  return [...starts, ...contains];
}
