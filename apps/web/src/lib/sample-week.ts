import type { Dinner } from "./week";

/**
 * Placeholder week shown until sign-in and the recipe import land.
 * Mirrors the approved design so the shell can be reviewed on its own.
 */
export const sampleWeek: Dinner[] = [
  {
    date: "2026-11-23",
    title: "Kale & Jack Quesadillas",
    tint: "#bfd48e",
    sharedWithKids: false,
    ingredients: [
      { name: "Kale", perishable: true },
      { name: "Monterey Jack", perishable: true },
      { name: "Tortillas", perishable: false },
    ],
  },
  {
    date: "2026-11-24",
    title: "Calabrian Shrimp & Orzo",
    tint: "#f0b98a",
    sharedWithKids: false,
    ingredients: [
      { name: "Shrimp", perishable: true },
      { name: "Lemon", perishable: true },
      { name: "Capers", perishable: true },
      { name: "Orzo", perishable: false },
    ],
  },
  {
    date: "2026-11-25",
    title: "Chicken Piccata",
    tint: "#e7d3b0",
    sharedWithKids: false,
    ingredients: [
      { name: "Chicken cutlets", perishable: true },
      { name: "Lemon", perishable: true },
      { name: "Capers", perishable: true },
      { name: "Kale", perishable: true },
    ],
  },
  {
    date: "2026-11-26",
    title: "Pesto Pasta & Lemon Ricotta",
    tint: "#9fcb8a",
    sharedWithKids: false,
    ingredients: [
      { name: "Lemon", perishable: true },
      { name: "Ricotta", perishable: true },
      { name: "Pesto", perishable: false },
    ],
  },
  {
    date: "2026-11-27",
    title: "Feta & Olive Pizza",
    tint: "#f2cf78",
    sharedWithKids: false,
    ingredients: [
      { name: "Feta", perishable: true },
      { name: "Olives", perishable: false },
      { name: "Pizza dough", perishable: true },
    ],
  },
];
