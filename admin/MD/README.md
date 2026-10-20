# Tejas's Coding Standard

This folder documents **how Tejas Mehar actually writes code** in this project (backend + frontend), reverse-engineered from the existing codebase. It is not a generic "best practices" guide — it is a personal style spec.

Purpose: whenever a new feature or a new project is started, an AI coding agent (or Tejas himself) should read these files first and reproduce the **same** structure, naming, and patterns shown here, instead of defaulting to generic/textbook patterns.

## How to use this

Before generating any backend or frontend code in a project that should follow this standard, read the file relevant to what you're building:

| File | Read this when you are... |
|---|---|
| [01-project-structure.md](01-project-structure.md) | Setting up folders / deciding where a new file goes |
| [02-backend-api-patterns.md](02-backend-api-patterns.md) | Writing a controller function or an Express route |
| [03-backend-models-mongoose.md](03-backend-models-mongoose.md) | Writing a Mongoose schema/model |
| [04-backend-middleware-config.md](04-backend-middleware-config.md) | Writing middleware, or config/integration files (DB, cloudinary, mailer, tokens) |
| [05-error-handling.md](05-error-handling.md) | Deciding how to catch/report errors, anywhere in the stack |
| [06-naming-conventions.md](06-naming-conventions.md) | Naming a file, function, variable, route, or Redux action |
| [07-redux-toolkit-patterns.md](07-redux-toolkit-patterns.md) | Writing a Redux slice or wiring the store |
| [08-frontend-api-integration.md](08-frontend-api-integration.md) | Calling the backend from a React component/hook |
| [09-coding-checklist.md](09-coding-checklist.md) | Quick checklist before finishing any backend or frontend task |

## The one-line summary of the style

Plain, explicit, minimal-abstraction code: async/await + try/catch everywhere, no service layer, no centralized error handler, no `createAsyncThunk` — Redux slices only hold data (set by plain reducers), all API calls live directly in the component or a small custom hook using raw `axios` calls with `withCredentials: true`, and every response is `res.status(code).json({ message, ...data })`.
