module.exports = {
  extends: ["next/core-web-vitals"],
  rules: {
    // Reglas personalizadas
    "no-unused-vars": "warn",
    "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
    "prefer-const": "error",
    "no-var": "error",
  },
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
}
