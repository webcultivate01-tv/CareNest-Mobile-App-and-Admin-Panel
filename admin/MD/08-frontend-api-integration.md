# Frontend API Integration Patterns

There is **no API client module / no axios instance / no interceptors**. Every call site imports raw `axios` and the `serverUrl` constant, and writes the full call inline.

## Standard GET

```js
import axios from "axios";
import { serverUrl } from "../App";

const result = await axios.get(serverUrl + "/api/course/getpublished", {
  withCredentials: true,
});
```

## Standard POST (JSON body)

```js
const result = await axios.post(
  serverUrl + "/api/auth/signup",
  { name, password, email, role },
  { withCredentials: true }
);
```

## Standard POST/PUT with file upload

```js
const formData = new FormData();
formData.append("title", title);
formData.append("subTitle", subTitle);
if (backendImage) {
  formData.append("thumbnail", backendImage);
}

const result = await axios.post(
  serverUrl + `/api/course/editcourse/${courseId}`,
  formData,
  {
    withCredentials: true,
    headers: { "Content-Type": "multipart/form-data" },
  }
);
```

Rules:

- `withCredentials: true` on **every single request**, no exceptions — auth is cookie-based.
- `serverUrl` is always string-concatenated: `serverUrl + "/api/..."` (or a template literal when a param is interpolated: `` serverUrl + `/api/course/getcoursebyid/${courseId}` `` ). Don't switch to a templated base URL config or `axios.create({ baseURL })` — this project deliberately keeps `serverUrl` as one plain exported string from `App.jsx`.
- File inputs are tracked as two pieces of state: a "frontend" preview (`URL.createObjectURL(file)`, shown in an `<img>`) and a "backend" raw `File` object (appended to `FormData` on submit) — see `EditCourses.jsx`'s `fontendImage`/`backendImage` pair.

## Two places API calls live

1. **Inside a page/component's event handler** — for anything triggered by a user action (submit, click, delete). The handler is an `async () => {}` arrow function defined in the component body, referenced by `onClick`/`onSubmit`. Shape:
   ```js
   const handleX = async () => {
     setLoading(true);
     try {
       const result = await axios...;
       // dispatch(...) and/or setState(...) and/or navigate(...)
       setLoading(false);
       toast.success("... Successfully", { position: "top-center", autoClose: 1000 });
     } catch (error) {
       console.log(error);
       setLoading(false);
       toast.error(error.response?.data?.message || "Something went wrong", {
         position: "top-center",
         autoClose: 2000,
       });
     }
   };
   ```
2. **Inside a `CustomHooks/useGetX.js` hook** — for data that should load automatically on mount/when a dependency changes (not user-triggered). Shape:
   ```js
   const useGetX = () => {
     const dispatch = useDispatch();
     useEffect(() => {
       const fetchX = async () => {
         try {
           const result = await axios.get(serverUrl + "/api/...", { withCredentials: true });
           dispatch(setXData(result.data));
         } catch (error) {
           console.log(error);
         }
       };
       fetchX();
     }, [/* deps */]);
   };
   export default useGetX;
   ```
   These hooks are called once, unconditionally, near the top of `App.jsx` (`useGetCurrentUser(); useGetCreatorCourse(); useGetPublishedCourse();`) so the app "preloads" this data on every load rather than each page fetching its own copy.

Don't introduce React Query / SWR / RTK Query — this project's pattern is plain `axios` + `useEffect` + Redux setters, on purpose.

## Toasts (`react-toastify`)

- `<ToastContainer />` is mounted once, at the top of `App.jsx`.
- Success: `toast.success("<Action> Successfully", { position: "top-center", autoClose: 1000 })` (1000ms for success).
- Error: `toast.error(error.response?.data?.message || "Something went wrong", { position: "top-center", autoClose: 2000 })` (2000ms for errors, longer so the user has time to read it).
- Always pass `position: "top-center"` explicitly on every toast call (no global default config) — keep doing this per-call rather than setting a default on `<ToastContainer />`.

## Loading state & buttons

- Every async-triggering button uses a local `useState(false)` loading flag, set `true` right before the call and `false` right after (success or failure), and the button shows `<ClipLoader size={30} color="white" />` in place of its label while loading:
  ```jsx
  <button onClick={handleX} disabled={loading}>
    {loading ? <ClipLoader size={30} color="white" /> : "Save"}
  </button>
  ```
- The full-app initial loading gate (`authChecked` from Redux) is handled once at the top of `App.jsx`, blocking the entire route tree with a centered `<ClipLoader size={50} color="#000" />` until the first `getcurrentuser` call resolves.

## Navigation after success

`useNavigate()` from `react-router-dom` is called directly in the handler after a successful request/dispatch — no redirect-via-state, no route guards reacting to a "justCreated" flag:

```js
dispatch(setUserData(result.data));
navigate("/");
```

## Auth-gated routing

Route-level access control is done inline in `App.jsx`'s `<Route element={...}>`, using the Redux `userData`/`role`, not a wrapper `<ProtectedRoute>` component:

```jsx
<Route
  path="/dashboard"
  element={userData?.role === "educator" ? <Dashboard /> : <Navigate to={"/signup"} />}
/>
```

Keep this inline-ternary style for new protected routes rather than extracting a `<ProtectedRoute>`/`<RequireAuth>` wrapper.
