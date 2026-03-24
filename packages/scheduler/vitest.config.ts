import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 1, minForks: 1 },
    },
  },
});
