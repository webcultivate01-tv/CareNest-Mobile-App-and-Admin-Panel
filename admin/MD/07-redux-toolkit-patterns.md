# Redux Toolkit Patterns

## Core rule: slices are dumb data containers

Slices in this project hold state and simple setters **only**. There is no `createAsyncThunk`, no `extraReducers`, no `RTK Query`, no thunk middleware customization, no selectors file. All async work (API calls) happens in components/hooks, which then call a plain setter action to push the result into the store. See [08-frontend-api-integration.md](08-frontend-api-integration.md) for where the actual `axios` calls live.

## The standard slice shape

```js
import { createSlice } from "@reduxjs/toolkit";

const xSlice = createSlice({
  name: "x",
  initialState: {
    xData: null, // or [] for list data
  },
  reducers: {
    setXData: (state, action) => {
      state.xData = action.payload;
    },
  },
});

export const { setXData } = xSlice.actions;
export default xSlice.reducer;
```

Rules:

- `initialState` fields default to `null` for "not loaded yet / single object" data, `[]` for list data that's iterated in JSX (e.g. `lectureData: []` so `.map()` never needs a guard).
- One reducer per state field, named `set<FieldName>`, doing nothing but `state.field = action.payload`. No merging, no partial updates, no validation inside the reducer — the caller is responsible for shaping the payload correctly before dispatching.
- Named export of the action creators, default export of the reducer — every slice file ends with:
  ```js
  export const { setX, setY } = xSlice.actions;
  export default xSlice.reducer;
  ```
- A slice can hold multiple related pieces of state if they belong to the same domain (see `courseSlice`: `creatorCourseData`, `courseData`, `selectedCourse`, `creatorData` — all course-related, one slice, four setters) rather than splitting into many tiny slices.

## Store setup

```js
import { configureStore } from "@reduxjs/toolkit";
import userSlice from "./userSlice.js";
import courseSlice from "./courseSlice.js";
// ...

export const store = configureStore({
  reducer: {
    user: userSlice,
    course: courseSlice,
    // key name matches the slice's domain, singular, camelCase
  },
});
```

Add one import + one `reducer` key per new slice, nothing else — no custom middleware, no `preloadedState`, no devtools config overrides.

## Reading/writing state in components

```js
const dispatch = useDispatch();
const { userData } = useSelector((state) => state.user);
```

- Always destructure the specific field(s) needed straight out of `useSelector`, don't select the whole slice object and dot into it later.
- Dispatch calls happen right after a successful `axios` call, inline in the `try` block of the handler — never inside a `useEffect` reacting to a separate "pending" flag:
  ```js
  const result = await axios.post(...);
  dispatch(setUserData(result.data));
  ```
- Auth-gate flags (like `authChecked`) are also just booleans in the slice, flipped manually (`dispatch(setAuthChecked(true))`) in a `finally` block after the initial user fetch — used at the top of `App.jsx` to gate rendering the whole route tree until the initial auth check completes.

## When adding a new domain (e.g. "notifications", "cart")

1. Create `src/redux/<domain>Slice.js` following the shape above.
2. Add it to `store.js`.
3. Write the fetch/mutate logic where it's used (component or a `useGet<Thing>` hook in `CustomHooks/`), and call the slice's setter on success. Do not reach for `createAsyncThunk` even though it's available in `@reduxjs/toolkit` — this project intentionally doesn't use it.
