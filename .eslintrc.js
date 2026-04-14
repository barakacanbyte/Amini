/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  ignorePatterns: [
    // Dependency and vendor directories
    "**/node_modules/**",
    // Compiled output
    "**/dist/**",
    "**/.next/**",
    "**/out/**",
    "**/coverage/**",
    // Foundry build artefacts
    "packages/contracts/out/**",
    "packages/contracts/cache/**",
    // Solidity library submodules — these are third-party, not linted here
    "packages/contracts/lib/**",
    // Supabase schema dump (generated SQL)
    "supabase/schema.sql",
  ],
  // TypeScript-specific rules are handled by each package's own config or tsc.
  // This root config exists primarily to set ignorePatterns for `eslint .` runs.
  rules: {},
};
