module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    "comma-dangle": ["error", "always-multiline"],
    "array-bracket-newline": ["error", { "multiline": true }],
    "indent": "off",
    "@typescript-eslint/indent": [
      "error",
      2,
      {
        "ArrayExpression": 1,
      },
    ],
    "function-paren-newline": ["error", "consistent"],
    "semi": ["error", "always"],
    "quotes": ["error", "single"],
  },
};
