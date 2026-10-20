# Quick Checklist (read this one when generating new code fast)

## New backend endpoint

- [ ] Model field(s) added/exist in `model/<x>Model.js` (expanded `{ type, required, ... }` object form, `{ timestamps: true }`).
- [ ] Controller function in `controllers/<x>Controller.js`: named export, `async (req, res) => {}`, single top-level `try/catch`.
- [ ] Destructure `req.body`/`req.params`/`req.query` on the first lines.
- [ ] Guard checks (`if (!x) return res.status(400/404).json({ message })`) before doing work, inside the `try`.
- [ ] Success: `return res.status(200|201).json(doc)` or `{ message, ...data }`.
- [ ] Catch: `return res.status(500).json({ message: \`<Action> error ${error}\` })`.
- [ ] Route added in `routes/<x>Route.js`: lowercase squashed path, `isAuth` first if protected, `upload.single(...)` if a file, then the controller.
- [ ] New router mounted in `backend/index.js` under `/api/<resource>` if it's a new resource.

## New Redux state

- [ ] `src/redux/<x>Slice.js`: `createSlice`, `initialState` with `null`/`[]` defaults, one `set<Field>` reducer per field, no thunks.
- [ ] Registered in `src/redux/store.js`.

## New frontend data fetch/mutation

- [ ] User-triggered (button/form) -> inline `async handleX` in the component, with a `loading` `useState`, `try/catch`, `toast.success`/`toast.error` (`autoClose: 1000` / `2000`, `position: "top-center"`), `navigate(...)` on success if applicable.
- [ ] Load-on-mount (not user-triggered) -> new hook in `src/CustomHooks/useGetX.js`/`.jsx`, `useEffect` + `axios` + dispatch, called once near the top of `App.jsx`.
- [ ] `axios` call always: `serverUrl + "/api/..."`, `{ withCredentials: true }`; add `headers: { "Content-Type": "multipart/form-data" }` + `FormData` if a file is involved.
- [ ] Error read as `error.response?.data?.message || "Something went wrong"`.

## Naming

- [ ] Files: `camelCase` for backend (`xModel.js`/`xController.js`/`xRoute.js`), `PascalCase.jsx` for React pages/components, `camelCase` + `Slice.js` for Redux.
- [ ] Functions: `verbNoun` for controllers (`createCourse`), `handleVerbNoun` for UI event handlers (`handleCreateCourse`), `useGetThing` for fetch-on-mount hooks, `set<Field>` for Redux setters.
- [ ] Routes: all lowercase, no separators (`/getcoursebyid/:courseId`).

## Don't introduce (unless explicitly asked)

- TypeScript, service/repository layers, centralized error middleware, `createAsyncThunk`/RTK Query, React Query/SWR, custom `axios.create` instance, validation libraries beyond `validator`, error boundaries, barrel `index.js` re-exports, a `<ProtectedRoute>` wrapper component.

See the other files in this folder for the full detail behind each line item: [README.md](README.md).
