# Backend API Patterns (Express + Mongoose)

## The standard controller shape

Every controller function follows this exact skeleton — no exceptions:

```js
export const doSomething = async (req, res) => {
  try {
    const { field1, field2 } = req.body; // or req.params / req.query
    // ...validation checks, each returning early...
    // ...db calls...
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: `<Action> error ${error}` });
  }
};
```

Key rules:

- **Named exports**, one `export const fnName = async (req, res) => {}` per handler. Never `export default` for controllers.
- **Always `async`, always wrapped in a single top-level `try/catch`.** No helper functions to reduce nesting, no early-return guard clauses outside the try block.
- **Always `return res.status(...).json(...)`** — the `return` is explicit even though it's the last statement in a branch, to stop execution.
- Destructure input directly from `req.body`, `req.params`, `req.query` on the first line(s) of the try block — don't pass a DTO/validated object around.
- No dedicated validation library/middleware for request shape (no Zod/Joi/express-validator) except `validator` (npm) for email format in auth. Manual `if (!field) return res.status(400)...` checks instead.

## Response conventions

- Success: `res.status(200)` for reads/updates, `res.status(201)` for creation (signup/login/create-lecture), `res.status(200)` for deletes with a message.
- The JSON body on success is **either**:
  - the raw document/array itself: `return res.status(200).json(course);`
  - or `{ message, ...extraData }`: `return res.status(200).json({ message: "Lecture created successfully", lecture, course: populatedCourse });`
  - There isn't a single universal envelope (no `{ success, data }` wrapper) — match whichever of the two the sibling endpoints in that controller already use.
- Error body is always `{ message: "..." }`, never an array, never the raw error object.
- Error message text is a template literal describing the action, with the caught error interpolated straight into the string:
  ```js
  return res.status(500).json({ message: `CreateCourse error ${error}` });
  return res.status(500).json({ message: `Failed to create lecture: ${error.message}` });
  ```
  Either `${error}` or `${error.message}` is used (mixed in the codebase) — prefer `${error.message}` for new code since it's cleaner, but don't feel the need to go back and "fix" the older ones.
- Status codes used for expected failures: `400` for missing/invalid input, bad state, or "already exists"; `404` for "not found"; `403` for "not authorized" (ownership checks); `500` for anything caught in `catch`.

## Not-found / guard checks

Every lookup by id is immediately guarded:

```js
const course = await Course.findById(courseId);
if (!course) {
  return res.status(400).json({ message: "Courses are Not Found" }); // note: 400 is used here, not always 404 — mixed in this codebase
}
```

Ownership checks (used in review update/delete) compare `req.userId` (set by `isAuth` middleware) against the document's owner field:

```js
if (review.user.toString() !== userId) {
  return res.status(403).json({ message: "Not authorized to update this review" });
}
```

## Route files

- One `express.Router()` per resource file, default-exported.
- Import only the specific controller functions needed (named imports), never `import * as`.
- Route paths are **lowercase, no hyphens, words squashed together**: `/getpublished`, `/getcoursebyid/:courseId`, `/editcourse/:courseId`, `/removelecture/:lectureId`, `/sendotp`, `/resetpassword`. Not kebab-case, not camelCase in the URL.
- Route path verbs mirror the controller function name loosely (`removeCourse` -> `/remove/:courseId`, `createLecture` -> `/createlecture/:courseId`).
- Middleware is chained inline in the route definition, in this order: `isAuth` first, then `upload.single("fieldName")` if a file is involved, then the controller:
  ```js
  router.post("/editcourse/:courseId", isAuth, upload.single("thumbnail"), editCourses);
  ```
- Public (no-auth) routes exist side by side with protected ones in the same router file — auth is applied per-route, not per-router (e.g. `getpublished` has no `isAuth`, `getCreatorCourses` does).
- Mounting in `index.js`: `app.use("/api/<resource>", <resource>Router)`, resource name in the URL matches the model/domain name, not always the filename exactly (e.g. `lactureRoute.js` mounts at `/api/lecture`, `paymentRoute.js` mounts at `/api/order`).

## File uploads (Cloudinary via Multer)

Standard flow for any endpoint that accepts an image/video:

1. Route uses `upload.single("<fieldName>")` from `middleware/multer.js` (disk storage into `./public`).
2. In the controller, only touch the file if present: `if (req.file) { const url = await uploadOnCloudinary(req.file.path); ... }`.
3. `uploadOnCloudinary` (in `config/cloudinary.js`) uploads then deletes the local temp file in a nested try/catch, and rethrows on upload failure so the controller's outer catch handles the response.
4. On the frontend, files are sent as `FormData` with header `"Content-Type": "multipart/form-data"` (see [08-frontend-api-integration.md](08-frontend-api-integration.md)).

## Auth / cookies

- JWT is created with `jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" })` in `config/token.js`, exported as `genToken`.
- On signup/login/googleAuth, the token is set as an httpOnly cookie, always with the same options:
  ```js
  res.cookie("token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  ```
- `isAuth` middleware reads `req.cookies.token`, verifies it, and sets `req.userId = verifyToken.userId` before calling `next()`. Controllers read the authenticated user via `req.userId`, never by re-decoding a token themselves.
- Logout just calls `res.clearCookie("token")`.

## Search / filtering

`searchController.js` shows the pattern for a flexible text search: split the query into words, build a regex per word, and `$or` across multiple fields plus a full-string regex fallback — no external search engine, plain Mongo regex.
