/**
 * pAIrbuilder — Schema Drizzle ORM
 * Postgres dialect. Specchio TypeScript di db/schema.sql.
 *
 * Uso:
 *   import { restaurants, users, foodItems, drinks, ... } from './db/schema';
 *   import { drizzle } from 'drizzle-orm/node-postgres';
 *   const db = drizzle(pool, { schema });
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  smallint,
  numeric,
  char,
  varchar,
  time,
  jsonb,
  json,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ===========================================================================
// ENUMS
// ===========================================================================
export const userRole = pgEnum('user_role', ['owner', 'manager', 'staff']);
export const drinkCategory = pgEnum('drink_category', [
  'wine', 'beer', 'spirit', 'cocktail', 'soft', 'water', 'hot',
]);
export const wineColor = pgEnum('wine_color', [
  'red', 'white', 'rose', 'sparkling', 'dessert', 'fortified',
]);
export const foodCourse = pgEnum('food_course', [
  'antipasto', 'primo', 'secondo', 'contorno', 'dessert', 'snack', 'altro',
]);
export const pairingSource = pgEnum('pairing_source', ['ai', 'manual']);

// ===========================================================================
// RESTAURANTS
// ===========================================================================
export const restaurants = pgTable('restaurants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  cuisineType: text('cuisine_type'),
  logoUrl: text('logo_url'),
  coverUrl: text('cover_url'),
  vatNumber: text('vat_number'),
  phone: text('phone'),
  email: text('email'),                       // citext lato SQL
  website: text('website'),
  addressLine: text('address_line'),
  city: text('city'),
  postalCode: text('postal_code'),
  province: text('province'),
  country: text('country').default('IT'),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
  instagram: text('instagram'),
  facebook: text('facebook'),
  tripadvisor: text('tripadvisor'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  activeIdx: index('idx_restaurants_active').on(t.isActive),
  cityIdx: index('idx_restaurants_city').on(t.city),
}));

// ===========================================================================
// USERS (login ristoranti)
// ===========================================================================
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name'),
  role: userRole('role').notNull().default('owner'),
  isActive: boolean('is_active').notNull().default(true),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  restIdx: index('idx_users_restaurant').on(t.restaurantId),
}));

// ===========================================================================
// SESSIONS (express-session / connect-pg-simple)
// ===========================================================================
export const sessions = pgTable('sessions', {
  sid: varchar('sid').primaryKey(),
  sess: json('sess').notNull(),
  expire: timestamp('expire', { withTimezone: true }).notNull(),
}, (t) => ({
  expireIdx: index('idx_sessions_expire').on(t.expire),
}));

// ===========================================================================
// AUTH TOKENS (reset password, verifica email)
// ===========================================================================
export const authTokens = pgTable('auth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  purpose: text('purpose').notNull(),       // 'reset' | 'verify'
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('idx_auth_tokens_user').on(t.userId),
}));

// ===========================================================================
// FOOD CATEGORIES
// ===========================================================================
export const foodCategories = pgTable('food_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  course: foodCourse('course'),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  restIdx: index('idx_food_categories_restaurant').on(t.restaurantId),
  uniqName: uniqueIndex('uq_food_categories_rest_name').on(t.restaurantId, t.name),
}));

// ===========================================================================
// FOOD ITEMS
// ===========================================================================
export const foodItems = pgTable('food_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id')
    .references(() => foodCategories.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  ingredients: text('ingredients'),
  allergens: text('allergens').array(),
  priceCents: integer('price_cents'),
  currency: char('currency', { length: 3 }).default('EUR'),
  flavorProfile: jsonb('flavor_profile'),
  cookingMethod: text('cooking_method'),
  isVegetarian: boolean('is_vegetarian').default(false),
  isVegan: boolean('is_vegan').default(false),
  isGlutenFree: boolean('is_gluten_free').default(false),
  spicyLevel: smallint('spicy_level'),
  imageUrl: text('image_url'),
  isAvailable: boolean('is_available').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  restIdx: index('idx_food_items_restaurant').on(t.restaurantId),
  catIdx: index('idx_food_items_category').on(t.categoryId),
  availIdx: index('idx_food_items_available').on(t.restaurantId, t.isAvailable),
  spicyChk: check('chk_food_spicy', sql`${t.spicyLevel} IS NULL OR (${t.spicyLevel} BETWEEN 0 AND 5)`),
}));

// ===========================================================================
// DRINKS
// ===========================================================================
export const drinks = pgTable('drinks', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  category: drinkCategory('category').notNull(),
  name: text('name').notNull(),
  producer: text('producer'),
  description: text('description'),
  country: text('country'),
  region: text('region'),
  vintage: integer('vintage'),
  abv: numeric('abv', { precision: 4, scale: 2 }),
  servingSizeMl: integer('serving_size_ml'),
  wineColor: wineColor('wine_color'),
  grapeVarieties: text('grape_varieties').array(),
  priceGlassCents: integer('price_glass_cents'),
  priceBottleCents: integer('price_bottle_cents'),
  currency: char('currency', { length: 3 }).default('EUR'),
  flavorProfile: jsonb('flavor_profile'),
  servingTempC: numeric('serving_temp_c', { precision: 3, scale: 1 }),
  imageUrl: text('image_url'),
  isAvailable: boolean('is_available').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  restIdx: index('idx_drinks_restaurant').on(t.restaurantId),
  catIdx: index('idx_drinks_category').on(t.restaurantId, t.category),
  availIdx: index('idx_drinks_available').on(t.restaurantId, t.isAvailable),
  wineColorChk: check('chk_wine_color',
    sql`${t.category} = 'wine' OR ${t.wineColor} IS NULL`),
}));

// ===========================================================================
// CONTACTS
// ===========================================================================
export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  fullName: text('full_name'),
  role: text('role'),
  phone: text('phone'),
  email: text('email'),
  notes: text('notes'),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  restIdx: index('idx_contacts_restaurant').on(t.restaurantId),
}));

// ===========================================================================
// OPENING HOURS
// ===========================================================================
export const openingHours = pgTable('opening_hours', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  dayOfWeek: smallint('day_of_week').notNull(),  // 0..6, 0=Domenica
  opensAt: time('opens_at').notNull(),
  closesAt: time('closes_at').notNull(),
  isClosed: boolean('is_closed').notNull().default(false),
  notes: text('notes'),
}, (t) => ({
  restIdx: index('idx_opening_hours_restaurant').on(t.restaurantId),
  dayChk: check('chk_day_of_week', sql`${t.dayOfWeek} BETWEEN 0 AND 6`),
}));

// ===========================================================================
// PAIRINGS
// ===========================================================================
export const pairings = pgTable('pairings', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  foodItemId: uuid('food_item_id').notNull()
    .references(() => foodItems.id, { onDelete: 'cascade' }),
  drinkId: uuid('drink_id').notNull()
    .references(() => drinks.id, { onDelete: 'cascade' }),
  score: numeric('score', { precision: 3, scale: 2 }),
  rationale: text('rationale'),
  source: pairingSource('source').notNull().default('ai'),
  model: text('model'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqFoodDrink: uniqueIndex('uq_pairings_food_drink').on(t.foodItemId, t.drinkId),
  restIdx: index('idx_pairings_restaurant').on(t.restaurantId),
  foodIdx: index('idx_pairings_food').on(t.foodItemId),
  drinkIdx: index('idx_pairings_drink').on(t.drinkId),
  scoreChk: check('chk_pairing_score',
    sql`${t.score} IS NULL OR (${t.score} BETWEEN 0 AND 1)`),
}));

// ===========================================================================
// AI REQUESTS (audit & cost tracking)
// ===========================================================================
export const aiRequests = pgTable('ai_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id')
    .references(() => restaurants.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  provider: text('provider'),
  model: text('model'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  costCents: integer('cost_cents'),
  requestPayload: jsonb('request_payload'),
  responsePayload: jsonb('response_payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  restIdx: index('idx_ai_requests_restaurant').on(t.restaurantId),
  createdIdx: index('idx_ai_requests_created').on(t.createdAt),
}));

// ===========================================================================
// TIPI HELPER (per uso lato applicazione)
// ===========================================================================
export type Restaurant   = typeof restaurants.$inferSelect;
export type NewRestaurant = typeof restaurants.$inferInsert;
export type User         = typeof users.$inferSelect;
export type NewUser      = typeof users.$inferInsert;
export type FoodItem     = typeof foodItems.$inferSelect;
export type NewFoodItem  = typeof foodItems.$inferInsert;
export type Drink        = typeof drinks.$inferSelect;
export type NewDrink     = typeof drinks.$inferInsert;
export type Pairing      = typeof pairings.$inferSelect;
export type NewPairing   = typeof pairings.$inferInsert;
