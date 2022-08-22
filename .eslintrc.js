module.exports = {
  root: true,
  extends: ['@sparkle/eslint-config-custom'],
  settings: {
    next: {
      rootDir: ['apps/*/'],
    },
  },
  ignorePatterns: ['.eslintrc.js'],
};
