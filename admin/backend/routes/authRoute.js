import express from "express";
import { getCurrentAdmin, login, logout } from "../controllers/authController.js";
import isAuth from "../middleware/isAuth.js";

const authRouter = express.Router();

authRouter.post("/login", login);
authRouter.get("/logout", logout);
authRouter.get("/getcurrentadmin", isAuth, getCurrentAdmin);

export default authRouter;
