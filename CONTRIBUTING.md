# Contributing to Phantom Password Manager

Thanks for your interest in contributing! This is a 100% client-side password manager built with React, TypeScript, and Vite.

## Getting Started

1. Fork the repository.
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/phantom-password-manager.git
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```

## Project Structure

```
src/
├── components/     # React components
├── lib/            # Utilities (crypto, HIBP)
├── test/           # Test setup
├── App.tsx         # Root component
├── main.tsx        # Entry point
├── index.css       # Global styles (Tailwind)
└── types.ts        # Shared types
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix lint issues automatically |
| `npm run format` | Format code with Prettier |
| `npm run test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |
| `npm run test:coverage` | Run tests with coverage |

## Coding Standards

- **TypeScript** — Strict mode enabled. Use explicit types; avoid `any`.
- **React** — Functional components with hooks. No class components.
- **Imports** — Use `@/` alias for absolute imports (maps to project root).
- **Linting** — ESLint with `@typescript-eslint` and `eslint-plugin-react`. Run `npm run lint` before committing.
- **Formatting** — Prettier (double quotes, trailing commas, 100 print width). Run `npm run format` to auto-format.
- **No `console.log`** — Use `console.warn` / `console.error` if needed. Logging is linted as a warning.
- **Unused variables** — Prefix with `_` to suppress the unused-vars warning.

## Testing

- Tests use **Vitest** with **jsdom** and **@testing-library/react**.
- Test files live next to their source files as `*.test.ts` or `*.spec.tsx`.
- Run `npm run test:run` before opening a pull request.

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/my-feature`.
2. Make your changes and ensure linting and tests pass.
3. Keep changes focused — one feature or fix per PR.
4. Write a clear commit message describing what and why.
5. Open a pull request against the `main` branch.

## Reporting Issues

- Use [GitHub Issues](https://github.com/anomalyco/phantom-password-manager/issues) for bug reports and feature requests.
- Include steps to reproduce, expected vs. actual behavior, and browser/OS info.

## Security

This is a security-sensitive project. If you discover a vulnerability, **do not** open a public issue. Report it privately using [GitHub's Private Vulnerability Reporting](https://github.com/anomalyco/phantom-password-manager/security/advisories/new).

## Code of Conduct

All contributors must abide by the [Code of Conduct](CODE_OF_CONDUCT.md).
