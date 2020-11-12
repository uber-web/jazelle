module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2020,
  },
  env: {
    node: true,
    es6: true,
  },
  extends: ['eslint:recommended', 'prettier', 'plugin:flowtype/recommended'],
  plugins: ['prettier'],
  rules: {
    'no-console': 0, // this package uses console to print info to stdout

    'no-unused-vars': [
      'error',
      {vars: 'all', args: 'none', ignoreRestSiblings: true},
    ],

    // Prettier settings
    'prettier/prettier': [
      'error',
      {
        printWidth: 80,
        tabWidth: 2,
        useTabs: false,
        semi: true,
        arrowParens: 'avoid',
        singleQuote: true,
        trailingComma: 'es5',
        bracketSpacing: false,
        jsxBracketSameLine: false,
        rangeStart: 0,
        rangeEnd: Infinity,
      },
    ],
  },
};
