/** @type {import("prettier").Config} */
const config = {
  quoteProps: 'consistent',
  semi: true,
  singleQuote: true,
  trailingComma: 'none',
  plugins: ['@ianvs/prettier-plugin-sort-imports'],
  importOrder: [
    '<THIRD_PARTY_MODULES>',
    '',
    '^@(common|components)/.*$',
    '',
    '^[./]'
  ],
  importOrderParserPlugins: ['typescript', 'decorators']
};

export default config;
