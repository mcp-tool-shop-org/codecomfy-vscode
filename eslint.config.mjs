import tseslint from "typescript-eslint";

export default tseslint.config(
    // Global ignores (replaces ignorePatterns)
    {
        ignores: [
            "dist/",
            "dist-test/",
            "test/register-vscode-stub.js",
        ],
    },

    // Base recommended rules
    ...tseslint.configs.recommended,

    // Project-specific overrides
    {
        files: ["src/**/*.ts", "test/**/*.ts"],
        rules: {
            "@typescript-eslint/no-unused-vars": ["warn", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
            }],
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-require-imports": "off",
            "no-case-declarations": "off",
        },
    },

    // VS Code stub uses namespaces to mimic the vscode module shape
    {
        files: ["test/stubs/**/*.ts"],
        rules: {
            "@typescript-eslint/no-namespace": "off",
        },
    },
);
