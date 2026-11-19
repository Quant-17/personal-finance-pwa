export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "var(--primary)",
        foreground: "var(--text)",
        border: "var(--border)",
      },
    },
  },
  plugins: [],
};
