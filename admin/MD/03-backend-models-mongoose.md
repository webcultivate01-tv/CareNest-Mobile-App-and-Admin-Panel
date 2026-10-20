# Mongoose Model Patterns

## Shape of a model file

```js
import mongoose from "mongoose";

const xSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      required: true,
    },
    // ...
  },
  { timestamps: true }
);

const X = mongoose.model("X", xSchema);
export default X;
```

Rules:

- Schema variable is named `<resource>Schema` (camelCase), model variable is `<Resource>` (PascalCase, singular, matches the Mongo collection name Mongoose will pluralize automatically).
- `{ timestamps: true }` is passed on every schema, always.
- Every field is written as an object (`{ type: String, required: true }`), even when it could be shorthand (`name: String`) — this is the consistent style, keep using the expanded object form for new fields.
- `default export` only, one model per file.
- One exception in the codebase: `lectureModel.js` does both a named export and a default export of the same model (`export const Lecture = ...; export default Lecture;`). Prefer default-only for new models to match the rest; don't propagate the double-export.

## Field conventions

- References: `{ type: mongoose.Schema.Types.ObjectId, ref: "ModelName" }`, wrapped in `[...]` when it's a one-to-many array (e.g. `Course.lectures`, `Course.enrolledStudents`, `User.enrollCourses`).
- Enums for constrained string fields: `{ type: String, enum: ["value1", "value2"], required: true }` (see `role` on `User`, `level` on `Course`).
- Booleans that gate visibility/state default explicitly: `{ type: Boolean, default: false }` (`isPublished`, `isOtpVerifed`).
- Sensitive/temporary auth fields live directly on the `User` model rather than a separate collection: `resetOtp`, `otpExpires`, `isOtpVerifed`.
- No custom instance/static methods on models, no Mongoose middleware/hooks (`pre`/`post` save hooks) — all logic (hashing, OTP generation, etc.) is done explicitly in the controller before `.save()`/`.create()`.
- No schema-level validators beyond `required`, `unique`, `enum`, `min`/`max` (see `Review.rating`) — anything more complex (password strength, email format) is validated manually in the controller with `validator` or regex.

## Populate pattern

Related data is pulled in with `.populate("fieldName")` at the query site, not via virtuals:

```js
const courses = await Course.find({ isPublished: true }).populate("lectures");
const reviews = await Review.find({ course: courseId }).populate("user", "name photoUrl role");
```

Use the field-selection form (`.populate("user", "name photoUrl role")`) whenever you don't want the full referenced document back.
