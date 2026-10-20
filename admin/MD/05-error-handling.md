# Error Handling Philosophy

There is **no centralized error handling** anywhere in this codebase — no Express error-handling middleware (`(err, req, res, next) => {}`), no global `try/catch` wrapper, no custom `AppError` class, no `asyncHandler` wrapper utility. Every async function is individually responsible for catching its own errors. Reproduce this — don't introduce a generic error-handling framework unless explicitly asked.

## Backend

Every controller and every middleware function:

```js
export const handler = async (req, res) => {
  try {
    // ...
  } catch (error) {
    return res.status(500).json({ message: `<ActionName> error ${error}` });
  }
};
```

- The catch block **always** produces a JSON response, never rethrows, never calls `next(error)`.
- The message string names the action that failed (`"CreateCourse error"`, `"Failed to create lecture:"`, `"faild to get Creator"`) followed by the interpolated error. Keep this "what failed + error" phrasing for new endpoints.
- No custom error classes/types are thrown from deeper layers — Mongoose/JWT/bcrypt errors bubble up as-is and get stringified straight into the message.
- `console.log(error)` / `console.error(...)` is used ad hoc for debugging in some catch blocks (e.g. `courseController.editCourses`, `orderController`) but not consistently — add it when you want visibility into a specific failure path, it's not mandatory boilerplate.
- Expected failure states (not found, unauthorized, bad input, duplicate) are **not** exceptions — they're handled with an early `if (...) return res.status(4xx).json({ message })` inside the `try`, before anything throws. Only truly unexpected failures (DB down, bad cast, third-party API error) reach the `catch`.

## Frontend

Every API call site:

```js
try {
  const result = await axios.post(serverUrl + "/api/...", payload, { withCredentials: true });
  // dispatch / navigate / toast.success(...)
} catch (error) {
  console.log(error);
  toast.error(error.response?.data?.message || "Something went wrong", {
    position: "top-center",
    autoClose: 2000,
  });
}
```

- Always read the backend's `message` off `error.response?.data?.message`, with a generic fallback string.
- Always `console.log(error)` (not `console.error`) before showing the toast, for local debugging.
- `loading` state (a plain `useState(false)`) is set to `true` right before the request and `false` in both the success path and the catch block — do this manually per call site, there's no global loading/error store.
- No error boundaries, no retry logic, no toast deduplication — a straightforward try/catch + toast per call.
- One exception to watch out for, not to copy: `Navbar.jsx`'s `handleLogout` does `toast.error(error.responce.data.message)` (typo `responce`, no optional chaining) — this will throw if `error.response` is undefined. When touching this pattern, fix it to the safe `error.response?.data?.message || "..."` form used everywhere else, don't propagate the unsafe version.

## Silent catches (rare, used intentionally)

A couple of fire-and-forget spots just `console.log(err)` with no user-facing toast (e.g. `EditCourses.getCourseById`, `useGetCreatorCourse`, `useGetPublishedCourse`) — this is acceptable for background/on-mount data fetches where a toast would be noisy, but any user-triggered action (button click, form submit) should always show a toast on failure.
