# Middleware & Config Patterns

## `config/` folder

Each third-party integration or cross-cutting utility gets exactly one file in `config/`, exporting a single default function (or a named function for one-off utilities like `uploadOnCloudinary`):

- `database.js` — `connectDB` (async, `mongoose.connect(process.env.MONGO_URL)`, logs success, `process.exit(1)` on failure).
- `cloudinary.js` — configures the SDK once at module load from `process.env.*`, exports `uploadOnCloudinary(filePath)`.
- `nodemailer.js` — configures a `transporter` once at module load, exports `sendMail(to, otp)` with the email HTML inlined directly in the same file (no separate template file/engine).
- `token.js` — exports `genToken(userId)` that signs and returns a JWT.

Pattern for these: configure the client **once at module scope** (not inside the exported function), then export a small async helper that uses it. All secrets come from `process.env.*`, no config object/schema validation on env vars — if a var is missing it just fails at call time.

## `middleware/` folder

- `isAuth.js` — default export, `async (req, res, next)`, reads `req.cookies.token`, verifies with `jwt.verify`, sets `req.userId`, calls `next()`. Follows the exact same try/catch + `res.status(...).json({ message })` shape as controllers (see [02-backend-api-patterns.md](02-backend-api-patterns.md) and [05-error-handling.md](05-error-handling.md)) — middleware error handling is not different from controller error handling in this codebase.
- `multer.js` — default export, a configured `multer({ storage })` instance using `diskStorage` into `./public`, filename prefixed with `Date.now() + "-" + file.originalname` to avoid collisions. Used directly in route files as `upload.single("fieldName")`.

## `index.js` (app entry point)

Order of setup, keep this order for new apps:

```js
import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/database.js";
import cookieParser from "cookie-parser";
import cors from "cors";
// ...import each <resource>Router...

dotenv.config();
const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: "<frontend-url>", credentials: true }));

app.use("/api/<resource>", resourceRouter); // one line per resource, repeated

app.get("/", (req, res) => res.send("Hello From Tejas Mehar"));

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
  connectDB();
});
```

Notes:

- `connectDB()` is called **inside** the `app.listen` callback, not before it.
- CORS origin is a hardcoded deployed frontend URL string (not read from an env var in this project) with `credentials: true` — needed because auth uses cookies.
- Module system is ESM everywhere (`"type": "module"` in `package.json`), so always `import`/`export`, never `require`.
