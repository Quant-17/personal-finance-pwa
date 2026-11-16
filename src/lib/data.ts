// Fictional data only. Model amounts use integer paise.
// The chart-only trend series uses whole INR (no fractional arithmetic).
export const demo = {
  month: "November 2026",
  income: 12_500_000,
  expenses: 4_875_000,
  existingEmi: 1_225_000,
  liquidCash: 24_250_000,
  reserve: 15_000_000,
  savings: 84_250_000,
};
export const freeCash = demo.income - demo.expenses - demo.existingEmi;
export const trends = [
  { month: "Jun", income: 110000, outflow: 72000 },
  { month: "Jul", income: 118000, outflow: 66000 },
  { month: "Aug", income: 115000, outflow: 76000 },
  { month: "Sep", income: 125000, outflow: 68000 },
  { month: "Oct", income: 120000, outflow: 74000 },
  { month: "Nov", income: 125000, outflow: 61000 },
];
export const categories = [
  {
    name: "Home & utilities",
    amount: 2_000_000,
    limit: 2_500_000,
    color: "#7864d9",
  },
  {
    name: "Food & groceries",
    amount: 1_250_000,
    limit: 1_500_000,
    color: "#aaa0ec",
  },
  { name: "Shopping", amount: 850_000, limit: 1_000_000, color: "#e6b875" },
  {
    name: "Travel & other",
    amount: 775_000,
    limit: 1_000_000,
    color: "#78b5ab",
  },
];
export const transactions = [
  {
    name: "Monthly salary",
    category: "Income",
    date: "01 Nov",
    amount: 12_500_000,
    icon: "income",
  },
  {
    name: "Apartment rent",
    category: "Home & utilities",
    date: "02 Nov",
    amount: -1_800_000,
    icon: "home",
  },
  {
    name: "Fresh basket",
    category: "Food & groceries",
    date: "12 Nov",
    amount: -285_000,
    icon: "food",
  },
  {
    name: "Weekend coffee",
    category: "Food & groceries",
    date: "15 Nov",
    amount: -48_000,
    icon: "food",
  },
];
export const accounts = [
  {
    name: "Everyday account",
    type: "Bank account · •• 2048",
    balance: 18_250_000,
    color: "purple",
  },
  {
    name: "Rainy day fund",
    type: "Savings account · •• 6012",
    balance: 6_000_000,
    color: "green",
  },
  {
    name: "Everyday credit",
    type: "Credit card · •• 8870",
    balance: -1_875_000,
    color: "orange",
  },
];
export const upcoming = [
  { name: "Car loan", detail: "EMI · 20 Nov", amount: 1_225_000, type: "loan" },
  {
    name: "Stream Plus",
    detail: "Subscription · 22 Nov",
    amount: 64_900,
    type: "subscription",
  },
  {
    name: "Cloud storage",
    detail: "Subscription · 25 Nov",
    amount: 14_900,
    type: "cloud",
  },
];
