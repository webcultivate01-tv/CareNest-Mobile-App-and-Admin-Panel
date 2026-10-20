# Naming Conventions

## Files

| Kind | Convention | Example |
|---|---|---|
| Backend model | `camelCase` + `Model.js` | `courseModel.js`, `userModel.js` |
| Backend controller | `camelCase` + `Controller.js` | `courseController.js` |
| Backend route | `camelCase` + `Route.js` (singular "Route") | `authRoute.js`, `courseRoute.js` |
| Backend config/util | `camelCase.js`, named after the integration | `cloudinary.js`, `nodemailer.js`, `token.js` |
| Backend middleware | `camelCase.js`, named after what it checks/does | `isAuth.js`, `multer.js` |
| React page | `PascalCase.jsx`, matches the route/screen name | `SignUp.jsx`, `CreateCourses.jsx` |
| React component | `PascalCase.jsx` | `Navbar.jsx` |
| Custom hook | `camelCase` file starting with `get`, exporting `useGet<Thing>` | `getCurrentUser.js` exports `useGetCurrentUser` |
| Redux slice | `camelCase` + `Slice.js` | `userSlice.js`, `courseSlice.js` |

## Functions

- Backend controller functions: **verb + Noun**, `camelCase`, describing the action on the resource: `createCourse`, `getPublishedCourses`, `getCreatorCourses`, `editCourses`, `getCourseById`, `removeCourse`, `updateReview`, `deleteReview`. Plural vs singular on the noun follows what's returned (`getPublishedCourses` returns many, `getCourseById` returns one) — match that logic for new endpoints.
- Frontend event handlers inside components: `handle` + Verb + Noun, `camelCase`: `handleSignup`, `handleCreateCourse`, `handleEditCourse`, `handleRemoveCourse`, `handleLogout`, `handleThumbnail`.
- Frontend data-fetching functions inside `useEffect`/hooks: plain verb + Noun describing what's fetched, no `handle` prefix since it's not a UI event: `getCourseById`, `creatorCourses`, `getCourseData`, `fetchUser`.
- Custom hooks: always `useGet<Thing>` for hooks whose only job is "fetch on mount and dispatch to Redux": `useGetCurrentUser`, `useGetCreatorCourse`, `useGetPublishedCourse`.
- Redux reducer actions: `set<StateKey>`, `camelCase`, one setter per state field, no verbs other than `set`: `setUserData`, `setAuthChecked`, `setCourseData`, `setSelectedCourse`, `setCreatorData`, `setLectureData`.

## Variables

- Booleans: `is<Adjective>` (`isPublished`, `isPreviewFree`, `isOtpVerifed`, `authChecked` is the one exception — no `is` prefix, keep as-is for that specific field since it's already used across the app).
- Loading flags are just `loading` (`useState(false)`), and when a component needs a second independent loading flag it's `loading1` (see `EditCourses.jsx` with `loading` for save and `loading1` for remove) — not `isSaving`/`isRemoving`. Keep the `loading`, `loading1`, `loading2`... pattern for multiple loading states in the same component rather than inventing descriptive names, to match existing style.
- IDs from route params are destructured directly by name: `const { courseId } = useParams();`, `const { courseId } = req.params;` — never renamed/aliased.
- The deployed backend URL is a single exported constant `serverUrl` from `App.jsx`, imported wherever an API call is made: `import { serverUrl } from "../App";`. Don't create a second `.env`-driven `API_URL` constant elsewhere — this project centralizes it as one exported string in `App.jsx`.

## Routes (URLs)

- All lowercase, words squashed together with no separators: `/getpublished`, `/getcoursebyid/:courseId`, `/sendotp`, `/removelecture/:lectureId`.
- Path param names are `camelCase` matching the model's `_id` semantics: `:courseId`, `:lectureId`, `:reviewId`.

## Things this project does NOT do (don't introduce them unasked)

- No TypeScript — plain `.js`/`.jsx` everywhere.
- No barrel files (`index.js` re-exporting a folder's contents).
- No interfaces/abstract base classes/repository pattern for data access — controllers call the Mongoose model directly.
- No constants file for magic strings like role names (`"student"`, `"educator"`) or category lists — they're inlined where used (e.g. the category `<option>` list is repeated inline in both `CreateCourses.jsx` and `EditCourses.jsx`).
