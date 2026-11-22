import type { EntityManager } from "typeorm";
import type { DietaryTag, Station } from "@dinego/shared";
import { MenuCategory } from "../../menu/entities/menu-category.entity.js";
import { MenuItem } from "../../menu/entities/menu-item.entity.js";

/**
 * Placeholder tax rate for demo data. Replace with the restaurant's real rate before
 * orders and payments start using it. It is not exposed on the public menu.
 */
const DEMO_TAX_RATE = 0;

type SeedItem = {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  station: Station;
  /** Illustrative values derived from the dish description; confirm with the kitchen. */
  allergens: string[];
  dietaryTags?: DietaryTag[];
  featured?: boolean;
};

type SeedCategory = {
  slug: string;
  name: string;
  description: string;
  items: SeedItem[];
};

/** Demo menu content. The web app reads the menu from the API, so this is the only copy. */
export const menuCatalog: SeedCategory[] = [
  {
    slug: "small-plates",
    name: "Small plates",
    description: "Made for the middle of the table.",
    items: [
      {
        slug: "crispy-calamari",
        name: "Crispy calamari",
        description: "Lemon aioli, pickled chilli, fresh herbs",
        priceCents: 890,
        station: "OTHER",
        allergens: ["molluscs", "gluten", "egg"],
        dietaryTags: ["SPICY"],
        featured: true,
      },
      {
        slug: "burrata-and-tomatoes",
        name: "Burrata & tomatoes",
        description: "Vine tomatoes, basil oil, toasted sourdough",
        priceCents: 1090,
        station: "COLD",
        allergens: ["dairy", "gluten"],
        dietaryTags: ["VEGETARIAN"],
      },
      {
        slug: "charred-corn-ribs",
        name: "Charred corn ribs",
        description: "Smoked paprika butter, lime, cotija",
        priceCents: 780,
        station: "GRILL",
        allergens: ["dairy"],
        dietaryTags: ["VEGETARIAN", "GLUTEN_FREE"],
      },
      {
        slug: "wild-mushroom-toast",
        name: "Wild mushroom toast",
        description: "Creamed mushrooms, thyme, grilled sourdough",
        priceCents: 950,
        station: "GRILL",
        allergens: ["dairy", "gluten"],
        dietaryTags: ["VEGETARIAN"],
      },
    ],
  },
  {
    slug: "mains",
    name: "Mains",
    description: "Comforting plates from our open kitchen.",
    items: [
      {
        slug: "smash-burger",
        name: "Smash burger",
        description: "Double patty, aged cheddar, house pickles, brioche",
        priceCents: 1290,
        station: "GRILL",
        allergens: ["gluten", "dairy", "egg"],
        featured: true,
      },
      {
        slug: "grilled-chicken",
        name: "Grilled chicken",
        description: "Charred greens, lemon butter, rosemary potatoes",
        priceCents: 1490,
        station: "GRILL",
        allergens: ["dairy"],
        dietaryTags: ["GLUTEN_FREE"],
      },
      {
        slug: "mushroom-risotto",
        name: "Mushroom risotto",
        description: "Wild mushrooms, parmesan, truffle oil",
        priceCents: 1390,
        station: "OTHER",
        allergens: ["dairy"],
        dietaryTags: ["VEGETARIAN", "GLUTEN_FREE"],
      },
      {
        slug: "ribeye-steak",
        name: "Ribeye steak",
        description: "250g ribeye, peppercorn sauce, thick-cut chips",
        priceCents: 2890,
        station: "GRILL",
        allergens: ["dairy"],
        dietaryTags: ["GLUTEN_FREE"],
      },
      {
        slug: "fish-and-chips",
        name: "Fish & chips",
        description: "Beer-battered haddock, tartar sauce, mushy peas",
        priceCents: 1590,
        station: "OTHER",
        allergens: ["fish", "gluten", "egg"],
      },
      {
        slug: "margherita-pizza",
        name: "Margherita pizza",
        description: "San Marzano tomato, fior di latte, basil",
        priceCents: 1190,
        station: "OTHER",
        allergens: ["gluten", "dairy"],
        dietaryTags: ["VEGETARIAN"],
      },
    ],
  },
  {
    slug: "desserts",
    name: "Desserts",
    description: "A little something before the last train.",
    items: [
      {
        slug: "chocolate-lava-cake",
        name: "Chocolate lava cake",
        description: "Warm centre, vanilla bean ice cream",
        priceCents: 790,
        station: "DESSERT",
        allergens: ["gluten", "dairy", "egg"],
        dietaryTags: ["VEGETARIAN"],
        featured: true,
      },
      {
        slug: "new-york-cheesecake",
        name: "New York cheesecake",
        description: "Berry compote, biscuit crumb",
        priceCents: 690,
        station: "DESSERT",
        allergens: ["gluten", "dairy", "egg"],
        dietaryTags: ["VEGETARIAN"],
      },
      {
        slug: "gelato-trio",
        name: "Gelato trio",
        description: "Three scoops, ask for today's flavours",
        priceCents: 590,
        station: "DESSERT",
        allergens: ["dairy"],
        dietaryTags: ["VEGETARIAN", "GLUTEN_FREE"],
      },
    ],
  },
  {
    slug: "drinks",
    name: "Drinks",
    description: "Coffee, house pours, and something cold.",
    items: [
      {
        slug: "house-lemonade",
        name: "House lemonade",
        description: "Fresh lemon, mint, soda",
        priceCents: 350,
        station: "BAR",
        allergens: [],
        dietaryTags: ["VEGAN", "GLUTEN_FREE"],
      },
      {
        slug: "espresso",
        name: "Espresso",
        description: "Double shot, locally roasted",
        priceCents: 300,
        station: "BAR",
        allergens: [],
        dietaryTags: ["VEGAN", "GLUTEN_FREE"],
      },
      {
        slug: "craft-beer",
        name: "Craft beer",
        description: "Rotating local tap, 330ml",
        priceCents: 550,
        station: "BAR",
        allergens: ["gluten"],
      },
      {
        slug: "sparkling-water",
        name: "Sparkling water",
        description: "750ml bottle",
        priceCents: 250,
        station: "BAR",
        allergens: [],
        dietaryTags: ["VEGAN", "GLUTEN_FREE"],
      },
    ],
  },
];

/**
 * Seeds the demo menu. Idempotent: categories and items are matched by slug and updated in place,
 * so re-running restores demo values without creating duplicates.
 */
export async function seedMenu(manager: EntityManager): Promise<void> {
  const categories = manager.getRepository(MenuCategory);
  const items = manager.getRepository(MenuItem);

  for (const [categoryIndex, seedCategory] of menuCatalog.entries()) {
    const category =
      (await categories.findOne({ where: { slug: seedCategory.slug } })) ?? categories.create();

    Object.assign(category, {
      slug: seedCategory.slug,
      name: seedCategory.name,
      description: seedCategory.description,
      sortOrder: (categoryIndex + 1) * 10,
      active: true,
    });
    const savedCategory = await categories.save(category);

    for (const [itemIndex, seedItem] of seedCategory.items.entries()) {
      const item = (await items.findOne({ where: { slug: seedItem.slug } })) ?? items.create();

      Object.assign(item, {
        categoryId: savedCategory.id,
        slug: seedItem.slug,
        name: seedItem.name,
        description: seedItem.description,
        priceCents: seedItem.priceCents,
        taxRate: DEMO_TAX_RATE,
        station: seedItem.station,
        allergens: seedItem.allergens,
        dietaryTags: seedItem.dietaryTags ?? [],
        featured: seedItem.featured ?? false,
        available: true,
        sortOrder: (itemIndex + 1) * 10,
      });
      await items.save(item);
    }
  }
}
