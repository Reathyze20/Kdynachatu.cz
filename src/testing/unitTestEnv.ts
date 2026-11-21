/**
 * Preload pro `npm run test:backend`: unit testy na DB nesahají, ale config.ts bez DATABASE_URL
 * ukončí proces. V CI (bez .env) proto dostanou nepoužitelnou zástupnou hodnotu; lokálně tím
 * unit testy nenačtou DATABASE_URL z .env.
 */
process.env.DATABASE_URL ||= "postgresql://unit:unit@127.0.0.1:1/unit_tests_never_connect";
