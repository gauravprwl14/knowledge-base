# ⚡ Quick Start Checklist

### 🛑 Before You Code
* [ ] **Translation First:** Define strings in `messages/en.json` first.
* [ ] **Schema First:** If building a form, write the Zod schema before the UI.

### 🏗️ Creating Components
1.  **Is it generic?** (Button, Modal) -> Build in `src/components/ui` (The Adapter).
2.  **Is it business logic?** (LoginForm) -> Build in `src/features/auth`.
3.  **Needs interactivity?** -> Add `'use client'`.
4.  **Needs Data?** -> Fetch in Server Parent, pass to Client Child (or use TanStack Query).

### 🧱 Building Forms
1.  Define Schema: `const schema = z.object({ email: z.string().email() })`
2.  Create Action: `async function loginAction(data) { 'use server'; ... }`
3.  Compose:
    ```tsx
    <Form schema={schema} action={loginAction}>
      <FormInput name="email" label={t('email_label')} />
      <FormSubmitButton>{t('login_btn')}</FormSubmitButton>
    </Form>
    ```

### 🎨 Styling
* Use `class-variance-authority` (CVA) for component variants.
* Use `cn()` utility to merge classes.
* Only use variables defined in `tailwind.config.ts`.