module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
    },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'prettier/@typescript-eslint',
        'plugin:prettier/recommended',
        'plugin:import/errors',
        'plugin:import/typescript',
    ],
    plugins: ['@typescript-eslint', 'prettier'],
    rules: {
        // place to specify ESLint rules - can be used to overwrite rules specified from the extended configs
        '@typescript-eslint/explicit-function-return-type': 'off',
        quotes: [2, 'single', { avoidEscape: true }],
        'prettier/prettier': ['error', { singleQuote: true }],
        '@typescript-eslint/indent': 'off',
        indent: 'off',
        '@typescript-eslint/no-inferrable-types': 'off',
    },
};
