// .eslintrc.js
module.exports = {
  root: true, // This tells ESLint to stop looking for config files in parent directories
  extends: [
    'eslint:recommended', // ESLint's recommended rules
    '@react-native', // Recommended rules for React Native from @react-native/eslint-config
    'plugin:@typescript-eslint/recommended', // TypeScript recommended rules
    'plugin:prettier/recommended', // Integrates Prettier with ESLint
    'plugin:jest/recommended',
  ],
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser for TypeScript
  plugins: [
    '@typescript-eslint', // ESLint plugin for TypeScript
    'prettier', // ESLint plugin for Prettier
    'jest',
  ],
  rules: {
    // Customize your rules here
    // Examples (uncomment or add as needed):
    // 'no-unused-vars': 'warn', // Warn about unused variables
    // 'prettier/prettier': 'error', // Report Prettier issues as errors
    // You might want to adjust some React Native specific rules or TypeScript rules later
    '@typescript-eslint/no-require-imports': 'warn', // turned it off
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  env: {
    node: true,
    //jest: true,
    'jest/globals': true,
  },
};
