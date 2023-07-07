module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: 'tsconfig.json',
        tsconfigRootDir: __dirname,
        sourceType: 'module'
    },
    extends: [
        'airbnb-base',
        'prettier',
        'plugin:@typescript-eslint/recommended'
    ],
    settings: {
        'import/resolver': {
            node: {
                extensions: ['.js', '.jsx', '.ts', '.tsx']
            }
        }
    },
    root: true,
    env: {
        node: true,
        jest: true
    },
    ignorePatterns: ['.eslintrc.js'],
    rules: {
        'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
        'no-await-in-loop': 'off',
        'no-restricted-syntax': 'off',
        'import/no-extraneous-dependencies': [
            'error',
            { devDependencies: ['**/*.test.ts', '**/*.spec.ts'] }
        ],
        'import/prefer-default-export': 'off',
        'import/no-default-export': 'error',
        'no-useless-constructor': 'off',
        'import/extensions': [
            'error',
            'ignorePackages',
            {
                ts: 'never'
            }
        ]
    }
};
