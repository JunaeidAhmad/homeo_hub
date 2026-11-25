import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The three areas (patient, doctor, admin) are code-split by route. Keeping them from
// importing one another is what guarantees a patient page never loads doctor or admin code.
const AREAS = ["patient", "doctor", "admin"];

const boundary = (area) => ({
  files: [`src/areas/${area}/**`, `src/app/[[]lang]/${area === "patient" ? "(patient)" : area}/**`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: AREAS.filter((other) => other !== area).flatMap((other) => [
          {
            group: [`@/areas/${other}`, `@/areas/${other}/*`, `@/i18n/messages/${other}`],
            message: `The ${area} area must not import ${other} code; share it from src/components or src/lib.`,
          },
        ]),
      },
    ],
  },
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...AREAS.map(boundary),
  {
    // Shared code stays area-agnostic.
    files: ["src/components/**", "src/lib/**", "src/api/**"],
    ignores: ["**/*.test.*"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/areas/*"],
              message: "Shared code must not import from an area.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
