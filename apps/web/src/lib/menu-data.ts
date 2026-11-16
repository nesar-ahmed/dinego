export type MenuTag = "Vegetarian" | "Vegan" | "Gluten-free" | "Spicy";

export type MenuItem = {
  name: string;
  description: string;
  priceCents: number;
  tags?: MenuTag[];
  featured?: boolean;
};

export type MenuCategory = {
  id: string;
  name: string;
  note: string;
  items: MenuItem[];
};

export const menuCategories: MenuCategory[] = [
  {
    id: "small-plates",
    name: "Small plates",
    note: "Made for the middle of the table.",
    items: [
      {
        name: "Crispy calamari",
        description: "Lemon aioli, pickled chilli, fresh herbs",
        priceCents: 890,
        tags: ["Spicy"],
        featured: true,
      },
      {
        name: "Burrata & tomatoes",
        description: "Vine tomatoes, basil oil, toasted sourdough",
        priceCents: 1090,
        tags: ["Vegetarian"],
      },
      {
        name: "Charred corn ribs",
        description: "Smoked paprika butter, lime, cotija",
        priceCents: 780,
        tags: ["Vegetarian", "Gluten-free"],
      },
      {
        name: "Wild mushroom toast",
        description: "Creamed mushrooms, thyme, grilled sourdough",
        priceCents: 950,
        tags: ["Vegetarian"],
      },
    ],
  },
  {
    id: "mains",
    name: "Mains",
    note: "Comforting plates from our open kitchen.",
    items: [
      {
        name: "Smash burger",
        description: "Double patty, aged cheddar, house pickles, brioche",
        priceCents: 1290,
        featured: true,
      },
      {
        name: "Grilled chicken",
        description: "Charred greens, lemon butter, rosemary potatoes",
        priceCents: 1490,
        tags: ["Gluten-free"],
      },
      {
        name: "Mushroom risotto",
        description: "Wild mushrooms, parmesan, truffle oil",
        priceCents: 1390,
        tags: ["Vegetarian", "Gluten-free"],
      },
      {
        name: "Ribeye steak",
        description: "250g ribeye, peppercorn sauce, thick-cut chips",
        priceCents: 2890,
        tags: ["Gluten-free"],
      },
      {
        name: "Fish & chips",
        description: "Beer-battered haddock, tartar sauce, mushy peas",
        priceCents: 1590,
      },
      {
        name: "Margherita pizza",
        description: "San Marzano tomato, fior di latte, basil",
        priceCents: 1190,
        tags: ["Vegetarian"],
      },
    ],
  },
  {
    id: "desserts",
    name: "Desserts",
    note: "A little something before the last train.",
    items: [
      {
        name: "Chocolate lava cake",
        description: "Warm centre, vanilla bean ice cream",
        priceCents: 790,
        tags: ["Vegetarian"],
        featured: true,
      },
      {
        name: "New York cheesecake",
        description: "Berry compote, biscuit crumb",
        priceCents: 690,
        tags: ["Vegetarian"],
      },
      {
        name: "Gelato trio",
        description: "Three scoops, ask for today's flavours",
        priceCents: 590,
        tags: ["Vegetarian", "Gluten-free"],
      },
    ],
  },
  {
    id: "drinks",
    name: "Drinks",
    note: "Coffee, house pours, and something cold.",
    items: [
      {
        name: "House lemonade",
        description: "Fresh lemon, mint, soda",
        priceCents: 350,
        tags: ["Vegan", "Gluten-free"],
      },
      {
        name: "Espresso",
        description: "Double shot, locally roasted",
        priceCents: 300,
        tags: ["Vegan", "Gluten-free"],
      },
      {
        name: "Craft beer",
        description: "Rotating local tap, 330ml",
        priceCents: 550,
      },
      {
        name: "Sparkling water",
        description: "750ml bottle",
        priceCents: 250,
        tags: ["Vegan", "Gluten-free"],
      },
    ],
  },
];

export const featuredDishes = menuCategories.flatMap((category) =>
  category.items
    .filter((item) => item.featured)
    .map((item) => ({ ...item, category: category.name })),
);

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
