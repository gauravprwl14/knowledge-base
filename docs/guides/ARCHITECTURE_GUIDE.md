# 🏛️ Modern Frontend Architecture & Guidelines

## 1. Core Philosophy: The Adapter Pattern
We do not couple our business logic to UI libraries. We own the interface.
* **External Libs:** (Radix, Headless UI) live **only** in `src/components/ui`.
* **Feature Code:** Imports from `src/components/ui`, NEVER from `node_modules` directly.
* **Why:** If we switch from Radix to AriaKit tomorrow, we only change the file in `ui/`, not 100 feature files.

## 2. Rendering Strategy: Server vs. Client
We default to **Server Components (RSC)** for performance and SEO.

### 🟢 When to use Server Components (Default)
* Fetching initial data (DB access, CMS).
* Layouts and static content.
* **SEO Sensitive Content:** Metadata, headings, main text.
* *Access:* Backend resources, headers, cookies.

### 🔵 When to use Client Components ('use client')
* **Interactivity:** `onClick`, `onChange`, `useEffect`.
* **Browser APIs:** `window`, `localStorage`, `geolocation`.
* **State:** `useState`, `useReducer`, React Context.
* **Note:** Push the `'use client'` directive as far down the tree as possible (to the leaf nodes).

### 🌊 Boundary Management
* **Don't** make the whole page a Client Component.
* **Do** pass Server Data as props to Client Components
* **Do** wrap interactive chunks in Suspense boundaries with Skeleton fallbacks.

## 3. State Management Hierarchy
Avoid prop drilling. Use the right tool for the scope.

1.  **Server State (Data):**
    * **Tool:** React Server Components (fetching) + TanStack Query (client-side re-fetching/mutation).
    * **Rule:** Don't put API data in Redux/Zustand unless strictly necessary.
2.  **URL State (Navigation/Filters):**
    * **Tool:** Next.js `searchParams`.
    * **Rule:** If a user refreshes the page, should the filter persist? If yes -> URL State.
3.  **Form State:**
    * **Tool:** React Hook Form (via our `Form` wrapper).
    * **Rule:** Never manual `useState` for inputs.
4.  **UI State (Transient):**
    * **Tool:** `useState` (e.g., isModalOpen).

## 4. The "Lego" Form System 🧱
We do not manually wire inputs. We use a **Smart Context-Driven System**.

* **The Container (`<Form>`):**
    * Wraps `react-hook-form` methods.
    * Accepts a Zod schema (`resolver`).
    * Exposes a `FormProvider` so children can access state automatically.
    * Handles `onSubmit` by calling a Server Action.
* **The Bricks (`<FormInput>`, `<FormSelect>`):**
    * Self-register using `useFormContext`.
    * Auto-display error messages from the Zod schema.
    * **Loading State:** The Submit button automatically detects `isSubmitting` and shows a spinner.

## 5. Styling & Design Tokens 🎨
* **Engine:** Tailwind CSS.
* **Rule:** Use semantic tokens (e.g., `text-muted-foreground` instead of `text-gray-500`).
* **Rule:** Use utility-first architecture Eg: Tailwind classes for layout and spacing.
* **Rule:** Use variables for colors, spacing, and other design tokens.
* **Rule:** Reuse tokens, css classes and styles across components.
* **Source of Truth:** CSS Variables (`:root`) defined in `globals.css`.
* **Guideline:** Use Modern UI design trend in 2025, use the latest design trends and best practices. eg: Glassmorphism, Neumorphism etc.
* **Rule:** Setup should have the light and dark theme.
* **Rule:** NEVER use arbitrary values (e.g., `w-[123px]`, `text-[#333]`).
* **Usage:**
    * ❌ `text-gray-500` (What is gray-500? It might change).
    * ✅ `text-muted-foreground` (Semantic token).
* **Reference:** [UI_UX_GUIDE.md](UI_UX_GUIDE.md)

## 6. Internationalization (i18n) 🌍
* **Rule:** No hardcoded strings. ZERO.
* **Rule:** Create the language switcher in the top right corner or within the user profile section based on the project requirements.
* **Rule:** avoid using the language in the urls if possible.
* **Rule:** If possible, set the default language to `en` or from the network request, Focus on the SSR and user experience.
* **Tool:** `next-intl` or similar.
* **Pattern:**
    ```tsx
    // ❌ Bad
    <h1>Welcome back</h1>

    // ✅ Good
    const t = useTranslations('Dashboard');
    <h1>{t('welcome')}</h1>
    ```

## 7. SEO & Accessibility ♿
* **Metadata:** Use Next.js `generateMetadata` for dynamic titles/descriptions.
* **Semantic HTML:** Use `<main>`, `<article>`, `<nav>` correctly.
* **Images:** All images must have `alt` tags (translated).
* **ARIA:** Our Adapter components (in `src/components/ui`) usually handle ARIA via Headless libs, but always verify manual controls.

## 8. Loading States
*  **SkeltonLoader:** Use this for initial page load.
*  **ActionButtonLoader:** Use this for form submission.
*  **Top-level Progress Bar:** Use this for tab switching.
*  **Blurred Image Placeholder:** Use this for image loading.
*  **Reference:** [Loader](loader.md)

## 9. Error handling
 * **Rule:** Use the error handling system provided, ensure to have the error boundary in place.
 * **Rule:** use error code, error category, error type, error message, error status code from the error handling system.
 * **Rule:** Avoid direct string access to the error code, error category, error type, error message, error status code, use proper constants or enums or interfaces.
 * **Rule:** Use the error handling system provided to create the errors.
 * **Rule:** Error handling is implemented using a builder pattern. 
 * **Rule:** If possible have a common utility function to capture and process the errors in the frontend apps;
 * **Guideline:** Error Guide [ERROR_GUIDE.md](ERROR_GUIDE.md)

## 10. Common Packages
* Zod: For validation.
* React Hook Form: For forms.
* TanStack Query: For data fetching.
* Axios: For API calls with interceptors.

