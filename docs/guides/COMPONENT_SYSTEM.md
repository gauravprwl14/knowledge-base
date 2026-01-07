# 🧱 Component System & Construction

Building consistent, high-quality components is key to maintaining our premium UI. This guide covers how we build and style components in this project.

## 1. Component Principles

- **Atomic Design**: Start with small, reusable "atoms" (buttons, inputs) and build up to "molecules" (search bars) and "organisms" (article views).
- **Accessibility by Default**: Every interactive element must have appropriate ARIA labels and keyboard support.
- **Theme Awareness**: Use CSS variables for all colors. Avoid hardcoding hex codes.

## 2. Creating a New Component

When creating a new component, follow this structure:

1.  **File Placement**:
    - Global UI: `src/components/ui/`
    - Feature-specific: `src/features/[feature-name]/components/`
2.  **Boilerplate**:
    ```tsx
    import { cn } from "@/lib/utils";

    interface MyComponentProps extends React.HTMLAttributes<HTMLDivElement> {
      readonly variant?: "default" | "outline";
    }

    export function MyComponent({ 
      className, 
      variant = "default", 
      ...props 
    }: MyComponentProps) {
      return (
        <div 
          className={cn(
            "rounded-md px-4 py-2", // Base styles
            variant === "outline" ? "border" : "bg-primary", // Variant styles
            className // User-provided styles
          )}
          {...props}
        />
      );
    }
    ```

## 3. Styling with Tailwind 4

We use **Tailwind CSS 4**. Key features to use:
- **Semantic Tokens**: Use `primary`, `secondary`, `accent`, `muted`, `destructive`, `border`, `input`, `ring`.
- **States**: Use `hover:`, `focus:`, `active:`, `disabled:`.
- **Responsive**: Use `sm:`, `md:`, `lg:`.

> [!IMPORTANT]
> Always use the `cn()` utility from `@/lib/utils` to merge Tailwind classes. This prevents class conflicts and handles conditional styling cleanly.

## 4. Animation Guidelines

We use **Framer Motion** for subtle micro-interactions.
- Keep animations **short** (200-300ms).
- Use **spring** transitions for a natural feel.
- Example: `whileHover={{ scale: 1.02 }}` on buttons.

---

> [!TIP]
> Check out existing components in `src/components/ui` for real-world examples of these patterns.
