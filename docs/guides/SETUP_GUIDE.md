# 🛠️ Project Setup Guide

Welcome to the `nextjs-ignite-kit`! This guide is designed to help you get the project running locally and understand our tech stack.

## 1. Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js**: v20 or higher (We recommend using `nvm` to manage Node versions)
- **npm**: v10.9 or higher (included with Node.js)
- **Git**: For version control

## 2. Getting Started

Follow these steps to set up the project locally:

### Clone the Repository
```bash
git clone <repository-url>
cd nextjs-ignite-kit
```

### Install Dependencies
```bash
npm install
```

### Run the Development Server
```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

## 3. Tech Stack Overview

This project uses a modern, high-performance stack:

| Technology | Purpose | Key Benefits |
| :--- | :--- | :--- |
| **Next.js 16** | Core Framework | App Router, Server Components (RSC), SEO optimized. |
| **React 19** | UI Library | Latest hooks, Concurrent Rendering. |
| **Tailwind CSS 4** | Styling | Utility-first, lightning-fast build, zero runtime. |
| **TypeScript** | Language | Type safety, better IDE support, fewer bugs. |
| **Vitest** | Testing | Extremely fast unit/integration testing. |
| **Lucide React** | Icons | Consistent, lightweight SVG icons. |
| **Framer Motion** | Animation | Smooth, declarative UI transitions. |

## 4. Key Scripts

- `npm run dev`: Starts the development server.
- `npm run build`: Creates an optimized production build.
- `npm run start`: Starts the production server.
- `npm run lint`: Runs ESLint to check for code style issues.
- `npm run test`: Runs the test suite once.
- `npm run test:watch`: Runs tests in watch mode for active development.
- `npm run test:coverage`: Generates a code coverage report.

## 5. Troubleshooting

- **Dependency Issues**: If you encounter errors after pulling changes, try `rm -rf node_modules package-lock.json && npm install`.
- **Next.js Cache**: Sometimes clearing the `.next` folder helps: `rm -rf .next && npm run dev`.

---

> [!TIP]
> Always check the terminal for meaningful error messages. If you're stuck, refer to our [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) to understand how the pieces fit together.
