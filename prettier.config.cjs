module.exports = {
  bracketSameLine: false,
  trailingComma: 'all',
  printWidth: 120,
  singleQuote: true,
  overrides: [
    {
      files: ['*.html', '*.css'],
      options: {
        singleQuote: false,
      },
    },
  ],
  // @trivago/prettier-plugin-sort-imports
  importOrder: ['^(?!@/)', '^[^.]', '^[.][.]', '^[.][/]'],
  importOrderSeparation: false,

  plugins: [
    // require('prettier-plugin-tailwindcss'),
    require('@trivago/prettier-plugin-sort-imports'),
    //
  ],
  // tailwindConfig: './apps/incos-web/tailwind.config.js',
};
