/** Single source of truth for the restaurant's public details (home page, menu, footer). */
export const restaurant = {
  name: "DineGo Kitchen",
  tagline: "Eat in. Take away. One flow.",
  address: { line1: "18 Market Lane", line2: "Riverside" },
  phone: { display: "+1 555 0100", href: "tel:+15550100" },
  email: "hello@dinegokitchen.com",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=18+Market+Lane+Riverside",
  seats: 48,
};

/** Weekly hours. `days` uses JavaScript day numbers (0 = Sunday). */
export const openingHours = [
  { label: "Monday – Thursday", days: [1, 2, 3, 4], opens: "12:00", closes: "22:00" },
  { label: "Friday – Saturday", days: [5, 6], opens: "12:00", closes: "23:00" },
  { label: "Sunday", days: [0], opens: "12:00", closes: "21:00" },
] as const;

export const services = [
  { label: "Lunch", time: "12:00 – 15:00" },
  { label: "Dinner", time: "from 17:00" },
  { label: "Takeaway", time: "all day" },
] as const;
