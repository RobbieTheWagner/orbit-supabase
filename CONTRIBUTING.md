# Contributing to orbit-supabase

Thank you for your interest in contributing to orbit-supabase! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- npm, yarn, or pnpm

### Getting Started

1. Clone the repository:
```bash
git clone https://github.com/RobbieTheWagner/orbit-supabase.git
cd orbit-supabase
```

2. Install dependencies:
```bash
npm install
```

3. Run tests:
```bash
npm test
```

4. Build the package:
```bash
npm run build
```

## Development Workflow

### Running in Development Mode

Watch mode for automatic rebuilds:
```bash
npm run dev
```

### Testing

Run tests once:
```bash
npm test
```

Watch mode for tests:
```bash
npm run test:watch
```

Generate coverage report:
```bash
npm run test:coverage
```

### Linting and Formatting

Check for lint issues:
```bash
npm run lint
```

Auto-fix lint issues:
```bash
npm run lint:fix
```

Format code:
```bash
npm run format
```

Check formatting:
```bash
npm run format:check
```

Type checking:
```bash
npm run typecheck
```

## Project Structure

```
orbit-supabase/
├── src/
│   ├── index.ts          # Main export
│   └── source.ts         # SupabaseSource implementation
├── test/
│   └── source.test.ts    # Tests
├── dist/                 # Built output (generated)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.mjs
└── README.md
```

## Code Style

- Use TypeScript for all source code
- Follow the existing code style (enforced by ESLint and Prettier)
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed

## Pull Request Process

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following the code style guidelines
3. **Add tests** for any new functionality
4. **Run the full test suite** to ensure nothing breaks
5. **Update documentation** if needed (README, JSDoc comments, etc.)
6. **Commit your changes** with clear, descriptive messages
7. **Push to your fork** and submit a pull request

### Commit Message Format

Use clear, descriptive commit messages:

```
feat: add support for many-to-many relationships
fix: handle null values in attribute serialization
docs: update usage examples in README
test: add tests for RLS injection
refactor: extract serialization logic to separate class
```

Prefixes:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `chore`: Maintenance tasks

## Testing Guidelines

- Write unit tests for all new functionality
- Aim for >80% code coverage
- Use descriptive test names
- Group related tests with `describe` blocks
- Mock external dependencies (Supabase client)

Example:
```typescript
describe('SupabaseSource', () => {
  describe('serialization', () => {
    it('should convert camelCase to snake_case', () => {
      // Test implementation
    });

    it('should handle null values correctly', () => {
      // Test implementation
    });
  });
});
```

## Documentation

- Add JSDoc comments for public APIs
- Update README.md for user-facing changes
- Include usage examples for new features
- Keep inline comments clear and concise

## Questions or Issues?

- **Bug reports**: Open an issue with a clear description and reproduction steps
- **Feature requests**: Open an issue describing the feature and use case
- **Questions**: Open a discussion or issue

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Assume good intentions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be acknowledged in the README and release notes.

Thank you for contributing to orbit-supabase! 🚀
