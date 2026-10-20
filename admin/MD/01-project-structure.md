# Project Structure

## Top level

Two independent apps, each with its own `package.json`, in one repo:

```
backend/
frontend/
```

No monorepo tooling (no workspaces, no turborepo). Each side is started independently (`npm run dev` in each folder).

## Backend layout

```
backend/
  index.js                 <- entry point: express app setup, route mounting, server start
  config/                  <- integrations / one-off setup helpers (singular folder name)
    database.js
    cloudinary.js
    nodemailer.js
    token.js
  controllers/             <- one file per resource, plural folder name
    authController.js
    courseController.js
    lectureController.js
    orderController.js
    reviewController.js
    searchController.js
    userController.js
  middleware/               <- singular folder name
    isAuth.js
    multer.js
  model/                    <- SINGULAR folder name (not "models")
    userModel.js
    courseModel.js
    lectureModel.js
    reviewModel.js
  routes/
    authRoute.js            <- SINGULAR "Route" suffix (not "Routes")
    courseRoute.js
    lactureRoute.js          <- (kept as spelled in this project; don't "fix" existing filenames)
    userRoute.js
    paymentRoute.js
    reviewRoute.js
  public/                   <- multer's local disk destination before cloudinary upload
```

Rules this implies for new resources:

- New resource `X` gets exactly 3 files: `model/xModel.js`, `controllers/xController.js`, `routes/xRoute.js`.
- File name = `camelCase(resourceName) + Model|Controller|Route` (e.g. `courseModel.js`, `courseController.js`, `courseRoute.js`).
- One `router` per resource file, mounted in `index.js` under `/api/<resource>`.
- Config/integration helpers (DB connect, 3rd-party SDK setup, mailers, token signing) go in `config/`, one file per concern.
- Cross-cutting request logic (auth check, file upload) goes in `middleware/`, one file per concern.

## Frontend layout

```
frontend/
  utils/                    <- top-level (NOT inside src), for 3rd-party client setup
    firebase.js
  src/
    App.jsx                 <- route table + exports `serverUrl` constant used everywhere
    redux/
      store.js               <- configureStore, one line per slice
      userSlice.js
      courseSlice.js
      lectureSlice.js
    CustomHooks/              <- PascalCase folder, hooks named useGetXxx
      getCurrentUser.js
      getCreatorCourse.js
      getPublishedCourse.jsx
    pages/                    <- one file per route/screen, PascalCase
      SignUp.jsx
      Login.jsx
      Educator/                <- role/feature-specific pages grouped in a subfolder
        CreateCourses.jsx
        EditCourses.jsx
        CreateLecture.jsx
    components/                <- shared/reusable UI pieces
      Navbar.jsx
```

Rules this implies for new features:

- Redux state slices go in `src/redux/<name>Slice.js`, and are registered in `src/redux/store.js` under a matching key.
- A hook that fetches data on mount and pushes it into Redux goes in `src/CustomHooks/get<Thing>.js` (or `.jsx` if it needs JSX — inconsistent extension in this codebase is fine, don't over-fix it).
- A new screen is a new file under `src/pages/` (or a role-specific subfolder like `Educator/` when it's specific to a role/section), registered as a `<Route>` in `App.jsx`.
- There's no `services/` or `api/` layer on the frontend — API calls are written inline where they're used (component or custom hook), not abstracted into a client module. See [08-frontend-api-integration.md](08-frontend-api-integration.md).
